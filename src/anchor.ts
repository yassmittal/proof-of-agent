import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { Signer } from '@mysten/sui/cryptography';
import { fromHex, toHex } from '@nobulex/crypto';
import type { getClient } from './env';
import type { RunManifest } from './manifest';
import type { PersistedRun } from './sink';

type Client = ReturnType<typeof getClient>;

/** BCS layout of the on-chain `audit_anchor::AuditAnchor` Move struct content. */
const AuditAnchorBcs = bcs.struct('AuditAnchor', {
  id: bcs.Address, // UID serializes as a 32-byte address
  agent_did: bcs.vector(bcs.u8()),
  covenant_hash: bcs.vector(bcs.u8()),
  chain_root: bcs.vector(bcs.u8()),
  walrus_blob_id: bcs.u256(),
  walrus_object_id: bcs.Address,
  anchored_at_ms: bcs.u64(),
  publisher: bcs.Address,
});

export interface AnchorResult {
  /** Object ID of the immutable on-chain AuditAnchor. */
  anchorObjectId: string;
  digest: string;
}

/** Decoded on-chain anchor (the trust roots a verifier reads from Sui). */
export interface OnChainAnchor {
  agentDid: string;
  covenantHash: string; // hex
  chainRoot: string; // hex
  walrusBlobIdU256: string;
  walrusObjectId: string;
  publisher: string;
}

/**
 * Anchor a persisted run on Sui: calls `audit_anchor::anchor_run`, which records
 * the receipt-chain root + Walrus blob identifiers in an immutable on-chain object.
 */
export async function anchorRun(opts: {
  client: Client;
  signer: Signer;
  packageId: string;
  manifest: RunManifest;
  persisted: PersistedRun;
}): Promise<AnchorResult> {
  const { client, signer, packageId, manifest, persisted } = opts;

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::audit_anchor::anchor_run`,
    arguments: [
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(manifest.agent.did))),
      tx.pure.vector('u8', Array.from(fromHex(manifest.covenant.id))),
      tx.pure.vector('u8', Array.from(fromHex(persisted.chainRoot))),
      // The real on-chain Walrus Blob object; the contract reads its blob_id and
      // object id directly, proving a genuine blob is referenced.
      tx.object(persisted.suiObjectId),
    ],
  });

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    include: { effects: true },
  });
  if (res.$kind !== 'Transaction') {
    throw new Error(`anchor transaction failed: ${JSON.stringify(res.FailedTransaction?.status)}`);
  }
  const exec = res.Transaction;
  await client.waitForTransaction({ digest: exec.digest });

  // The frozen AuditAnchor is the only object created and made Immutable.
  const created = exec.effects?.changedObjects.find(
    (c) => c.idOperation === 'Created' && c.outputOwner?.$kind === 'Immutable',
  );
  if (!created) throw new Error('AuditAnchor (immutable created object) not found in effects');

  return { anchorObjectId: created.objectId, digest: exec.digest };
}

/** Read and decode an on-chain AuditAnchor by object ID. */
export async function readAnchor(client: Client, anchorObjectId: string): Promise<OnChainAnchor> {
  const { object } = await client.getObject({
    objectId: anchorObjectId,
    include: { content: true },
  });
  if (!object.content) throw new Error('anchor object has no content');

  const a = AuditAnchorBcs.parse(object.content);
  return {
    agentDid: new TextDecoder().decode(Uint8Array.from(a.agent_did)),
    covenantHash: toHex(Uint8Array.from(a.covenant_hash)),
    chainRoot: toHex(Uint8Array.from(a.chain_root)),
    walrusBlobIdU256: String(a.walrus_blob_id),
    walrusObjectId: normalizeSuiAddress(a.walrus_object_id),
    publisher: normalizeSuiAddress(a.publisher),
  };
}
