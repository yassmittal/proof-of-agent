import { generateKeyPair, generateId } from '@nobulex/crypto';
import { buildCovenant, type Issuer, type Beneficiary } from '@nobulex/core';
import { ActionLogBuilder } from '@nobulex/action-log';
import { getClient, getKeypair } from './env';
import { buildRunManifest, verifyRunManifest, type RunManifest } from './manifest';

// Stand-in for a real agent: three governed actions producing a hash-chained log.
// (Swapped for a real LLM agent later; the receipt/verify path is identical.)
async function simulateAgentRun() {
  const issuerKeys = await generateKeyPair();
  const agentKeys = await generateKeyPair();

  const issuer: Issuer = {
    id: 'org:proof-of-agent',
    publicKey: issuerKeys.publicKeyHex,
    role: 'issuer',
    name: 'Proof-of-Agent',
  };
  const beneficiary: Beneficiary = {
    id: `agent:${agentKeys.publicKeyHex.slice(0, 12)}`,
    publicKey: agentKeys.publicKeyHex,
    role: 'beneficiary',
    name: 'Demo Agent',
  };

  const covenant = await buildCovenant({
    issuer,
    beneficiary,
    constraints: [
      "permit read on '/data/**'",
      "permit analyze on '/models/**'",
      "permit notify on '/users/**'",
      "deny write on '**'",
    ].join('\n'),
    privateKey: issuerKeys.privateKey,
    metadata: { name: 'Demo Run Policy', tags: ['demo'] },
  });

  const agentDid = `did:nobulex:${agentKeys.publicKeyHex}`;
  const log = new ActionLogBuilder(agentDid);
  log.append({ action: 'read', resource: '/data/market-prices', params: { symbol: 'SUI' }, outcome: 'success' });
  log.append({ action: 'analyze', resource: '/models/forecast', params: { horizon: '7d' }, outcome: 'success' });
  log.append({ action: 'notify', resource: '/users/owner', params: { channel: 'email' }, outcome: 'success' });

  const manifest = await buildRunManifest({
    runId: generateId(),
    agentKeys,
    covenant,
    actionLog: log.toLog(),
    citedInputBlobIds: [],
  });

  return manifest;
}

async function main() {
  console.log('--- simulating agent run ---');
  const manifest = await simulateAgentRun();
  console.log('runId    :', manifest.runId);
  console.log('agent did:', manifest.agent.did);
  console.log('headHash :', manifest.signature.headHash);
  console.log('actions  :', manifest.actionLog.entries.map((e) => e.action).join(' -> '));

  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  console.log(`\n--- storing manifest on Walrus (${bytes.byteLength} bytes) ---`);

  const client = getClient();
  const signer = getKeypair();
  const { blobId, blobObject } = await client.walrus.writeBlob({
    blob: bytes,
    deletable: true,
    epochs: 3,
    signer,
  });
  console.log('blobId      :', blobId);
  console.log('suiObjectId :', blobObject.id);

  console.log('\n--- reading back + verifying from Walrus ---');
  const readBytes = new Uint8Array(await client.walrus.readBlob({ blobId }));

  const sameLength = readBytes.byteLength === bytes.byteLength;
  const sameBytes = sameLength && readBytes.every((b, i) => b === bytes[i]);
  console.log('byte-for-byte round-trip:', sameBytes ? 'OK' : 'MISMATCH');

  const parsed = JSON.parse(new TextDecoder().decode(readBytes)) as RunManifest;
  const result = await verifyRunManifest(parsed);

  console.log('\nverification:');
  for (const c of result.checks) {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\noverall: ${result.valid && sameBytes ? 'VERIFIED ✓' : 'FAILED ✗'}`);
  console.log('\nWalruscan:', `https://walruscan.com/testnet/blob/${blobId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
