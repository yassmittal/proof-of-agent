import 'dotenv/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Agent, setGlobalDispatcher } from 'undici';
import { SUI_FULLNODE_URL, WALRUS_TIMEOUT_MS } from './config';
import { createWriteClient } from './walrus-client';

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

/** Read + write Walrus client for the CLI scripts. */
export function getClient() {
  return createWriteClient(process.env.SUI_RPC_URL ?? SUI_FULLNODE_URL);
}
