import { verifyIntegrity, computeEntryHash, type ActionLog } from '@nobulex/action-log';
import { signString, verify, toHex, fromHex, type KeyPair } from '@nobulex/crypto';
import { computeId, computeEffectiveConstraints, type CovenantDocument } from '@nobulex/core';
import { evaluate } from '@nobulex/ccl';

/** An agent's DID, derived from its ed25519 public key. */
export function agentDid(publicKeyHex: string): string {
  return `did:nobulex:${publicKeyHex}`;
}

/**
 * Re-derive the head of the hash chain from the action content alone, ignoring
 * the hashes already stored in the log. A verifier recomputes this and compares
 * it against the root anchored on Sui, so it must be deterministic.
 */
export function computeChainRoot(log: ActionLog): string {
  let previousHash: string | null = null;
  let head = '';
  for (const e of log.entries) {
    head = computeEntryHash({
      index: e.index,
      timestamp: e.timestamp,
      agentDid: e.agentDid,
      action: e.action,
      resource: e.resource,
      params: e.params,
      outcome: e.outcome,
      previousHash,
    });
    previousHash = head;
  }
  return head;
}

/**
 * A self-contained, verifiable record of one agent run.
 *
 * It bundles the agent identity, the covenant it operated under, the
 * hash-chained action log, and a signature over the chain head. Everything a
 * third party needs to re-verify the run lives inside this object — which is
 * exactly what gets stored as a single Walrus blob.
 */
export interface RunManifest {
  version: 1;
  runId: string;
  createdAt: string;
  agent: {
    /** did:nobulex:<ed25519 public key hex> */
    did: string;
    /** hex-encoded ed25519 public key, used to verify `signature.value` */
    publicKey: string;
  };
  covenant: {
    id: string;
    document: CovenantDocument;
  };
  /** Hash-chained log of every action the agent took. */
  actionLog: ActionLog;
  /** Walrus blob IDs of any input data the agent relied on. */
  citedInputBlobIds: string[];
  /** Agent's ed25519 signature over the action-log head hash. */
  signature: {
    over: 'headHash';
    headHash: string;
    value: string;
  };
}

/** Build and sign a run manifest from a completed action log. */
export async function buildRunManifest(params: {
  runId: string;
  agentKeys: KeyPair;
  covenant: CovenantDocument;
  actionLog: ActionLog;
  citedInputBlobIds?: string[];
}): Promise<RunManifest> {
  const headHash = params.actionLog.headHash ?? '';
  const sig = await signString(headHash, params.agentKeys.privateKey);

  return {
    version: 1,
    runId: params.runId,
    createdAt: new Date().toISOString(),
    agent: {
      did: agentDid(params.agentKeys.publicKeyHex),
      publicKey: params.agentKeys.publicKeyHex,
    },
    covenant: {
      id: computeId(params.covenant),
      document: params.covenant,
    },
    actionLog: params.actionLog,
    citedInputBlobIds: params.citedInputBlobIds ?? [],
    signature: { over: 'headHash', headHash, value: toHex(sig) },
  };
}

export interface ManifestCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ManifestVerification {
  valid: boolean;
  checks: ManifestCheck[];
}

/**
 * Re-verify a run manifest using only its own contents, trusting nothing about
 * where it came from.
 */
export async function verifyRunManifest(m: RunManifest): Promise<ManifestVerification> {
  const checks: ManifestCheck[] = [];

  const integrity = verifyIntegrity(m.actionLog);
  checks.push({
    name: 'actionLog.integrity',
    ok: integrity.valid,
    detail: integrity.errors.join('; ') || undefined,
  });

  // Recomputing the root from action content alone catches a tampered headHash.
  const recomputedRoot = computeChainRoot(m.actionLog);
  const headMatches = m.signature.headHash === recomputedRoot;
  checks.push({
    name: 'signature.headHash matches recomputed chain root',
    ok: headMatches,
    detail: headMatches ? undefined : `expected ${recomputedRoot}`,
  });

  let sigOk = false;
  let sigError: string | undefined;
  try {
    sigOk = await verify(
      new TextEncoder().encode(m.signature.headHash),
      fromHex(m.signature.value),
      fromHex(m.agent.publicKey),
    );
  } catch (e) {
    sigError = String(e);
  }
  checks.push({ name: 'signature.valid', ok: sigOk, detail: sigError });

  checks.push({
    name: 'covenant.id matches document',
    ok: computeId(m.covenant.document) === m.covenant.id,
  });

  // Re-prove the agent stayed inside its covenant. Re-evaluate every logged action
  // against the covenant's own constraints: actions that ran (success/failure) must be
  // permitted, and blocked actions must be genuinely denied. This upgrades the result
  // from "the log wasn't altered" to "the agent provably obeyed its policy".
  let compliant = true;
  let complianceDetail: string | undefined;
  try {
    const ccl = await computeEffectiveConstraints(m.covenant.document, []);
    for (const e of m.actionLog.entries) {
      const permitted = evaluate(ccl, e.action, e.resource).permitted;
      const ranOrAllowed = e.outcome !== 'blocked';
      if (permitted !== ranOrAllowed) {
        compliant = false;
        complianceDetail = `${e.action} on ${e.resource}: logged "${e.outcome}" but policy ${permitted ? 'permits' : 'denies'} it`;
        break;
      }
    }
  } catch (err) {
    compliant = false;
    complianceDetail = String(err);
  }
  checks.push({
    name: 'agent obeyed its covenant (policy re-evaluated)',
    ok: compliant,
    detail: complianceDetail,
  });

  return { valid: checks.every((c) => c.ok), checks };
}
