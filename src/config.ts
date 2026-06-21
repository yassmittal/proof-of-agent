// Network endpoints, on-chain addresses, and storage defaults for Sui + Walrus Testnet.

export const NETWORK = 'testnet' as const;

export const SUI_FULLNODE_URL = 'https://fullnode.testnet.sui.io:443';

// Direct-to-node Walrus writes are unreliable on testnet; route them through the relay.
export const WALRUS_UPLOAD_RELAY_URL = 'https://upload-relay.testnet.walrus.space';

// WAL token, which pays for Walrus storage.
export const WAL_COIN_TYPE =
  '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';

// Deployed Walrus package; a genuine blob object has type `${WALRUS_PACKAGE_ID}::blob::Blob`.
export const WALRUS_PACKAGE_ID =
  '0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66';
export const WALRUS_BLOB_TYPE = `${WALRUS_PACKAGE_ID}::blob::Blob`;

// Walrus nodes can be slow to respond, so we raise client timeouts well above the default.
export const WALRUS_TIMEOUT_MS = 60_000;

// Upper bound on the SUI tip (in MIST) paid to the upload relay per write.
export const UPLOAD_RELAY_MAX_TIP = 1_000;

// Epochs a stored blob stays alive unless overridden.
export const DEFAULT_STORAGE_EPOCHS = 3;

// Claude model for the first-party agent path (src/agent-claude.ts).
export const AGENT_MODEL = 'claude-opus-4-8';

// Default AWS region for the Bedrock path; overridden by the AWS_REGION env var.
export const BEDROCK_REGION = 'us-east-1';

// Default Bedrock model for the Converse agent (src/agent-bedrock.ts). The audit layer
// is model-agnostic; any tool-calling Bedrock model works. Override with BEDROCK_MODEL.
export const BEDROCK_MODEL = 'mistral.mistral-large-3-675b-instruct';

export const explorer = {
  blob: (blobId: string) => `https://walruscan.com/testnet/blob/${blobId}`,
  object: (objectId: string) => `https://testnet.suivision.xyz/object/${objectId}`,
};
