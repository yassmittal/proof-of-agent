import { getClient, getKeypair } from './env';
import { explorer } from './config';
import { verifyRunManifest } from './manifest';
import { WalrusReceiptSink } from './sink';
import { simulateAgentRun } from './agent';

async function main() {
  console.log('--- simulating agent run ---');
  const manifest = await simulateAgentRun();
  console.log('runId    :', manifest.runId);
  console.log('agent did:', manifest.agent.did);
  console.log('headHash :', manifest.signature.headHash);
  console.log('actions  :', manifest.actionLog.entries.map((e) => e.action).join(' -> '));

  console.log('\n--- storing manifest on Walrus ---');
  const sink = new WalrusReceiptSink({ client: getClient(), signer: getKeypair() });
  const persisted = await sink.persistRun(manifest);
  console.log('blobId      :', persisted.blobId);
  console.log('suiObjectId :', persisted.suiObjectId);
  console.log('chainRoot   :', persisted.chainRoot, `(${persisted.size} bytes)`);

  console.log('\n--- reading back + verifying from Walrus ---');
  const loaded = await sink.loadRun(persisted.blobId);
  const result = await verifyRunManifest(loaded);

  console.log('verification:');
  for (const c of result.checks) {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  console.log(`\noverall: ${result.valid ? 'VERIFIED' : 'FAILED'}`);
  console.log('\nWalruscan:', explorer.blob(persisted.blobId));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
