import { getClient, getKeypair } from './env';
import { explorer } from './config';
import { verifyRunManifest } from './manifest';
import { WalrusReceiptSink } from './sink';
import { seedMarketDatasets } from './datasets';
import { runAgent } from './run-agent';

async function main() {
  const client = getClient();
  const signer = getKeypair();

  // Store the data the agent will consume as its own Walrus blob(s) first, so the run's
  // inputs are content-addressed and the agent can cite them. Skipped gracefully if it fails.
  let datasets;
  try {
    datasets = await seedMarketDatasets(client, signer, ['SUI']);
  } catch (e) {
    console.warn('cited-input seeding skipped:', String(e));
  }

  const manifest = await runAgent(undefined, datasets);
  console.log('runId    :', manifest.runId);
  console.log('agent did:', manifest.agent.did);
  console.log('headHash :', manifest.signature.headHash);
  console.log('actions  :', manifest.actionLog.entries.map((e) => e.action).join(' -> '));
  console.log('cited    :', manifest.citedInputBlobIds.join(', ') || '(none)');

  console.log('\n--- storing manifest on Walrus ---');
  const sink = new WalrusReceiptSink({ client, signer });
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
