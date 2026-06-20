import type { Signer } from '@mysten/sui/cryptography';
import { computeChainRoot, type RunManifest } from './manifest';
import { DEFAULT_STORAGE_EPOCHS } from './config';
import type { WalrusClient } from './walrus-client';

type WalrusCapableClient = WalrusClient;

/** Everything needed to anchor a stored run on Sui and later verify it. */
export interface PersistedRun {
  /** Walrus blob ID (content hash, base64url) — read the manifest back with this. */
  blobId: string;
  /** Walrus blob ID as a u256 decimal string — what the on-chain anchor stores. */
  blobIdU256: string;
  /** Sui object ID of the on-chain Walrus Blob. */
  suiObjectId: string;
  /** Independently recomputed head of the receipt hash chain. */
  chainRoot: string;
  /** Manifest size in bytes. */
  size: number;
}

/**
 * Persists signed run manifests to Walrus. Callers hand it a `RunManifest` and
 * get back a `PersistedRun`, without touching the Walrus client directly.
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
    this.epochs = opts.epochs ?? DEFAULT_STORAGE_EPOCHS;
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
      blobIdU256: String(blobObject.blob_id),
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
