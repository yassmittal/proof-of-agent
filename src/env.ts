import 'dotenv/config';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { walrus, TESTNET_WALRUS_PACKAGE_CONFIG } from '@mysten/walrus';
import { Agent, setGlobalDispatcher } from 'undici';

// Walrus storage nodes can be slow; bump connect timeouts (per ts-sdks examples).
setGlobalDispatcher(
  new Agent({
    connectTimeout: 60_000,
    connect: { timeout: 60_000 },
  }),
);

export const SUI_RPC_URL = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';

// Testnet WAL coin type (from ts-sdks/packages/walrus/examples/funded-keypair.ts).
export const WAL_COIN_TYPE =
  '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';

export { TESTNET_WALRUS_PACKAGE_CONFIG };

/** Load the project keypair from SUI_PRIVATE_KEY (bech32 suiprivkey...). */
export function getKeypair(): Ed25519Keypair {
  const sk = process.env.SUI_PRIVATE_KEY;
  if (!sk) {
    throw new Error('SUI_PRIVATE_KEY is not set. Run `npm run keygen` and put it in .env');
  }
  return Ed25519Keypair.fromSecretKey(sk);
}

/** Published audit_anchor Move package ID (required for anchoring/verifying). */
export function getPackageId(): string {
  const id = process.env.AUDIT_ANCHOR_PACKAGE_ID;
  if (!id) throw new Error('AUDIT_ANCHOR_PACKAGE_ID is not set in .env');
  return id;
}

/** Sui gRPC client extended with the Walrus client (`.walrus.*`). */
export function getClient() {
  return new SuiGrpcClient({
    network: 'testnet',
    baseUrl: SUI_RPC_URL,
  }).$extend(
    walrus({
      // Direct-to-node writes are flaky on testnet; the upload relay reliably
      // fans slivers out to storage nodes for a small SUI tip.
      uploadRelay: {
        host: 'https://upload-relay.testnet.walrus.space',
        sendTip: { max: 1_000 },
      },
      storageNodeClientOptions: { timeout: 60_000 },
    }),
  );
}
