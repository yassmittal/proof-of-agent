import 'dotenv/config';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { walrus } from '@mysten/walrus';
import { Agent, setGlobalDispatcher } from 'undici';
import {
  NETWORK,
  SUI_FULLNODE_URL,
  WALRUS_UPLOAD_RELAY_URL,
  WALRUS_TIMEOUT_MS,
  UPLOAD_RELAY_MAX_TIP,
} from './config';

// Raise the 10s default connect timeout — Walrus nodes are often slower than that.
setGlobalDispatcher(
  new Agent({ connectTimeout: WALRUS_TIMEOUT_MS, connect: { timeout: WALRUS_TIMEOUT_MS } }),
);

/** Load the project keypair from SUI_PRIVATE_KEY (bech32 `suiprivkey1...`). */
export function getKeypair(): Ed25519Keypair {
  const secret = process.env.SUI_PRIVATE_KEY;
  if (!secret) throw new Error('SUI_PRIVATE_KEY is not set. Run `bun run keygen` and add it to .env');
  return Ed25519Keypair.fromSecretKey(secret);
}

/** The published `audit_anchor` Move package ID. */
export function getPackageId(): string {
  const id = process.env.AUDIT_ANCHOR_PACKAGE_ID;
  if (!id) throw new Error('AUDIT_ANCHOR_PACKAGE_ID is not set in .env');
  return id;
}

/** Sui gRPC client extended with the Walrus client (`.walrus.*`). */
export function getClient() {
  return new SuiGrpcClient({
    network: NETWORK,
    baseUrl: process.env.SUI_RPC_URL ?? SUI_FULLNODE_URL,
  }).$extend(
    walrus({
      uploadRelay: { host: WALRUS_UPLOAD_RELAY_URL, sendTip: { max: UPLOAD_RELAY_MAX_TIP } },
      storageNodeClientOptions: { timeout: WALRUS_TIMEOUT_MS },
    }),
  );
}
