import type { Signer } from '@mysten/sui/cryptography';
import type { WalrusClient } from './walrus-client';
import { DEFAULT_STORAGE_EPOCHS } from './config';

// A market dataset that lives on Walrus as its own blob. Because the blob ID is the hash
// of this content, citing it in a run proves exactly which data the agent consumed.
export interface MarketDataset {
  asset: string;
  price: number;
  volatility: number;
  source: string;
}

export interface CitedDataset {
  blobId: string;
  data: MarketDataset;
}

// Deterministic stand-in for a live feed. Kept content-stable (no timestamp) so the same
// data always hashes to the same Walrus blob ID.
export function marketData(asset: string): MarketDataset {
  const seed = [...asset.toUpperCase()].reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    asset: asset.toUpperCase(),
    price: Number((10 + (seed % 90) + (seed % 17) / 10).toFixed(2)),
    volatility: Number(((seed % 13) / 100 + 0.02).toFixed(3)),
    source: 'proof-of-agent demo feed',
  };
}

/**
 * Write each asset's market dataset to Walrus and return a map keyed by lowercased asset.
 * The agent reads these back during its run and cites their blob IDs, so a verifier can
 * later re-fetch the exact inputs the agent used.
 */
export async function seedMarketDatasets(
  client: WalrusClient,
  signer: Signer,
  assets: string[],
): Promise<Map<string, CitedDataset>> {
  const out = new Map<string, CitedDataset>();
  for (const asset of assets) {
    const data = marketData(asset);
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const { blobId } = await client.walrus.writeBlob({
      blob: bytes,
      deletable: true,
      epochs: DEFAULT_STORAGE_EPOCHS,
      signer,
    });
    out.set(asset.toLowerCase(), { blobId, data });
  }
  return out;
}
