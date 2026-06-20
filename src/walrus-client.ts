import { SuiGrpcClient } from '@mysten/sui/grpc';
import { walrus } from '@mysten/walrus';
import {
  NETWORK,
  SUI_FULLNODE_URL,
  WALRUS_TIMEOUT_MS,
  WALRUS_UPLOAD_RELAY_URL,
  UPLOAD_RELAY_MAX_TIP,
} from './config';

/** A Sui gRPC client extended with the Walrus client (`.walrus.*`). */
export type WalrusClient = ReturnType<typeof createReadClient>;

/** Read-only client — all that's needed to fetch and verify (no upload relay). */
export function createReadClient(rpcUrl: string = SUI_FULLNODE_URL) {
  return new SuiGrpcClient({ network: NETWORK, baseUrl: rpcUrl }).$extend(
    walrus({ storageNodeClientOptions: { timeout: WALRUS_TIMEOUT_MS } }),
  );
}

/** Read + write client — adds the upload relay required for storing blobs. */
export function createWriteClient(rpcUrl: string = SUI_FULLNODE_URL) {
  return new SuiGrpcClient({ network: NETWORK, baseUrl: rpcUrl }).$extend(
    walrus({
      uploadRelay: { host: WALRUS_UPLOAD_RELAY_URL, sendTip: { max: UPLOAD_RELAY_MAX_TIP } },
      storageNodeClientOptions: { timeout: WALRUS_TIMEOUT_MS },
    }),
  );
}
