import { normalizeSuiAddress } from '@mysten/sui/utils';
import { getClient, getKeypair, getPackageId } from './env';
import { explorer } from './config';
import { WalrusReceiptSink } from './sink';
import { runAgent } from './run-agent';
import { anchorRun, readAnchor } from './anchor';

async function main() {
  console.log('--- running agent ---');
  const manifest = await runAgent();
  console.log('agent did:', manifest.agent.did);

  const client = getClient();
  const signer = getKeypair();

  console.log('\n--- storing manifest on Walrus ---');
  const persisted = await new WalrusReceiptSink({ client, signer }).persistRun(manifest);
  console.log('blobId      :', persisted.blobId);
  console.log('suiObjectId :', persisted.suiObjectId);
  console.log('chainRoot   :', persisted.chainRoot);

  console.log('\n--- anchoring on Sui ---');
  const anchor = await anchorRun({ client, signer, packageId: getPackageId(), manifest, persisted });
  console.log('anchorObjectId:', anchor.anchorObjectId);
  console.log('tx digest     :', anchor.digest);

  console.log('\n--- reading on-chain anchor back + cross-checking ---');
  const onChain = await readAnchor(client, anchor.anchorObjectId);

  const checks = [
    ['chain_root matches', onChain.chainRoot === persisted.chainRoot],
    ['walrus_blob_id matches', onChain.walrusBlobIdU256 === persisted.blobIdU256],
    ['walrus_object_id matches', onChain.walrusObjectId === normalizeSuiAddress(persisted.suiObjectId)],
    ['agent_did matches', onChain.agentDid === manifest.agent.did],
    ['covenant_hash matches', onChain.covenantHash === manifest.covenant.id],
  ] as const;

  for (const [name, ok] of checks) console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`);
  console.log(`\noverall: ${checks.every(([, ok]) => ok) ? 'ANCHORED + VERIFIED' : 'FAILED'}`);
  console.log('\nSuiVision:', explorer.object(anchor.anchorObjectId));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
