import { test, expect } from 'bun:test';
import { generateKeyPair, generateId } from '@nobulex/crypto';
import { buildCovenant } from '@nobulex/core';
import { ActionLogBuilder } from '@nobulex/action-log';
import { buildRunManifest, verifyRunManifest, computeChainRoot } from './manifest';

async function makeManifest() {
  const issuer = await generateKeyPair();
  const agent = await generateKeyPair();
  const covenant = await buildCovenant({
    issuer: { id: 'org:test', publicKey: issuer.publicKeyHex, role: 'issuer', name: 'Test' },
    beneficiary: { id: 'agent:test', publicKey: agent.publicKeyHex, role: 'beneficiary', name: 'Agent' },
    constraints: "permit read on '/data/**'",
    privateKey: issuer.privateKey,
    metadata: { name: 'Test', tags: [] },
  });
  const log = new ActionLogBuilder(`did:nobulex:${agent.publicKeyHex}`);
  log.append({ action: 'read', resource: '/data/x', params: {}, outcome: 'success' });
  log.append({ action: 'read', resource: '/data/y', params: { n: 1 }, outcome: 'success' });
  return buildRunManifest({ runId: generateId(), agentKeys: agent, covenant, actionLog: log.toLog() });
}

test('computeChainRoot is deterministic and equals the signed head', async () => {
  const m = await makeManifest();
  expect(computeChainRoot(m.actionLog)).toBe(computeChainRoot(m.actionLog));
  expect(computeChainRoot(m.actionLog)).toBe(m.signature.headHash);
});

test('verifyRunManifest passes for an untampered manifest', async () => {
  const m = await makeManifest();
  const r = await verifyRunManifest(m);
  expect(r.valid).toBe(true);
});

test('tampering an action breaks verification', async () => {
  const m = await makeManifest();
  // entries are readonly at the type level; tamper at runtime to simulate an attacker.
  (m.actionLog.entries[1] as { action: string }).action = 'write';
  const r = await verifyRunManifest(m);
  expect(r.valid).toBe(false);
});
