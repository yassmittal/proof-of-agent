import { getClient } from './env';
import { explorer } from './config';
import { verifyAnchor } from './verify';

async function main() {
  const anchorObjectId = process.argv[2];
  if (!anchorObjectId) {
    console.error('usage: bun run verify <anchorObjectId>');
    process.exit(1);
  }

  const report = await verifyAnchor(getClient(), anchorObjectId);

  console.log('anchor   :', report.anchorObjectId);
  console.log('agent    :', report.anchor.agentDid);
  console.log('blobId   :', report.blobId);
  console.log('actions  :', report.manifest?.actionLog.entries.map((e) => e.action).join(' -> ') ?? '(unread)');

  console.log('\nverification:');
  for (const c of report.checks) {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }

  console.log(`\noverall: ${report.valid ? 'VERIFIED' : 'FAILED'}`);
  console.log('\nWalruscan:', explorer.blob(report.blobId));
  console.log('SuiVision:', explorer.object(report.anchorObjectId));
  process.exit(report.valid ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
