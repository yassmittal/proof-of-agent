// Proof-of-Agent SDK — verifiable, Walrus-persisted audit trails for AI agents.
export {
  buildRunManifest,
  verifyRunManifest,
  computeChainRoot,
  type RunManifest,
  type ManifestCheck,
  type ManifestVerification,
} from './manifest';
export { WalrusReceiptSink, type PersistedRun } from './sink';
export { anchorRun, readAnchor, type AnchorResult, type OnChainAnchor } from './anchor';
export { verifyAnchor, type AnchorVerification } from './verify';
export { simulateAgentRun } from './agent';
export { runClaudeAgent } from './agent-claude';
