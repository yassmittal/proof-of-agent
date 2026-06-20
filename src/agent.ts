import { generateKeyPair, generateId } from '@nobulex/crypto';
import { buildCovenant, type Issuer, type Beneficiary } from '@nobulex/core';
import { ActionLogBuilder } from '@nobulex/action-log';
import { buildRunManifest, type RunManifest } from './manifest';

/**
 * Stand-in for a real agent: three governed actions producing a hash-chained log.
 * Swapping this for a real LLM agent later leaves the receipt/verify path identical.
 */
export async function simulateAgentRun(): Promise<RunManifest> {
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

  return buildRunManifest({
    runId: generateId(),
    agentKeys,
    covenant,
    actionLog: log.toLog(),
    citedInputBlobIds: [],
  });
}
