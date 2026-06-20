import type { Signer } from '@mysten/sui/cryptography';
import { computeChainRoot, type RunManifest } from './manifest';
import type { getClient } from './env';

/** A Walrus-capable client (Sui gRPC client extended with `.walrus`). */
type WalrusCapableClient = ReturnType<typeof getClient>;

/** The outcome of persisting a run: everything Phase 3 needs to anchor it on Sui. */
export interface PersistedRun {
  /** Walrus blob ID (content hash) — read the manifest back with this. */
  blobId: string;
  /** Sui object ID of the on-chain Walrus Blob. */
  suiObjectId: string;
  /** Independently recomputed head of the receipt hash chain. */
  chainRoot: string;
  /** Manifest size in bytes. */
  size: number;
}

/**
 * Persists signed agent-run manifests to Walrus. This is the SDK's core piece:
 * callers hand it a `RunManifest` and get back everything needed to anchor and
 * later verify the run — without touching the Walrus client directly.
 */
export class WalrusReceiptSink {
  private readonly client: WalrusCapableClient;
  private readonly signer: Signer;
  private readonly epochs: number;
  private readonly deletable: boolean;

  constructor(opts: {
    client: WalrusCapableClient;
    signer: Signer;
    epochs?: number;
    deletable?: boolean;
  }) {
    this.client = opts.client;
    this.signer = opts.signer;
    this.epochs = opts.epochs ?? 3;
    this.deletable = opts.deletable ?? true;
  }

  /** Store a run manifest as a single Walrus blob. */
  async persistRun(manifest: RunManifest): Promise<PersistedRun> {
    const bytes = new TextEncoder().encode(JSON.stringify(manifest));
    const { blobId, blobObject } = await this.client.walrus.writeBlob({
      blob: bytes,
      deletable: this.deletable,
      epochs: this.epochs,
      signer: this.signer,
    });
    return {
      blobId,
      suiObjectId: blobObject.id,
      chainRoot: computeChainRoot(manifest.actionLog),
      size: bytes.byteLength,
    };
  }

  /** Read a run manifest back from Walrus by blob ID. */
  async loadRun(blobId: string): Promise<RunManifest> {
    const bytes = new Uint8Array(await this.client.walrus.readBlob({ blobId }));
    return JSON.parse(new TextDecoder().decode(bytes)) as RunManifest;
  }
}
