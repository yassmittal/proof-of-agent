import { blobIdFromInt } from '@mysten/walrus';
import { WALRUS_BLOB_TYPE } from './config';
import type { WalrusClient } from './walrus-client';
import { readAnchor, type OnChainAnchor } from './anchor';
import { verifyRunManifest, type ManifestCheck, type RunManifest } from './manifest';

type Client = WalrusClient;

export interface AnchorVerification {
  valid: boolean;
  anchorObjectId: string;
  blobId: string;
  anchor: OnChainAnchor;
  manifest?: RunManifest;
  checks: ManifestCheck[];
}

/**
 * Verify an agent run from nothing but its Sui anchor object ID. Reconstructs the
 * full chain of trust from public data: the on-chain anchor, the genuine Walrus
 * blob it references, and the manifest's own signatures and hash chain — trusting
 * neither the publisher nor any server.
 */
export async function verifyAnchor(
  client: Client,
  anchorObjectId: string,
): Promise<AnchorVerification> {
  const checks: ManifestCheck[] = [];

  const anchor = await readAnchor(client, anchorObjectId);
  const blobId = blobIdFromInt(anchor.walrusBlobIdU256);

  // The anchored object id is a genuine Walrus Blob whose content id matches the anchor.
  const { object } = await client.getObject({
    objectId: anchor.walrusObjectId,
    include: { json: true },
  });
  checks.push({
    name: 'referenced object is a Walrus Blob',
    ok: object.type === WALRUS_BLOB_TYPE,
    detail: object.type === WALRUS_BLOB_TYPE ? undefined : object.type,
  });
  const onChainBlobId = String((object.json as { blob_id?: unknown })?.blob_id ?? '');
  checks.push({
    name: 'on-chain Blob.blob_id matches anchor',
    ok: onChainBlobId === anchor.walrusBlobIdU256,
    detail: onChainBlobId === anchor.walrusBlobIdU256 ? undefined : `chain has ${onChainBlobId}`,
  });

  // Fetch the manifest from Walrus and re-verify it on its own (signatures + hash chain).
  let manifest: RunManifest;
  try {
    const bytes = new Uint8Array(await client.walrus.readBlob({ blobId }));
    manifest = JSON.parse(new TextDecoder().decode(bytes)) as RunManifest;
  } catch (e) {
    checks.push({ name: 'manifest readable from Walrus', ok: false, detail: String(e) });
    return { valid: false, anchorObjectId, blobId, anchor, checks };
  }
  checks.push({ name: 'manifest readable from Walrus', ok: true });
  checks.push(...(await verifyRunManifest(manifest)).checks);

  // The manifest the publisher stored is the one they committed to on-chain.
  checks.push({
    name: 'manifest chain root matches anchored chain_root',
    ok: manifest.signature.headHash === anchor.chainRoot,
  });
  checks.push({
    name: 'manifest agent matches anchored agent_did',
    ok: manifest.agent.did === anchor.agentDid,
  });
  checks.push({
    name: 'manifest covenant matches anchored covenant_hash',
    ok: manifest.covenant.id === anchor.covenantHash,
  });

  return { valid: checks.every((c) => c.ok), anchorObjectId, blobId, anchor, manifest, checks };
}
