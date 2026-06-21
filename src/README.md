# src

The whole thing that isn't the smart contract or the website lives here: the agent, the
proof format, the Walrus and Sui plumbing, and the command-line scripts that tie them together.

If you want to follow one run end to end, read the files in this order: `agent-core` →
`manifest` → `sink` → `anchor` → `verify`. Everything else is either a thin entry point or a
helper.

## The pipeline

- **`agent-core.ts`** — the heart of it. Defines the covenant (the agent's permit/deny policy),
  the tools the agent can call, and the one function every tool call goes through
  (`applyToolCall`). That function checks the call against the policy *before* it runs and writes
  a signed receipt either way — `success` if allowed, `blocked` if the covenant says no.
- **`agent.ts`** — a fake 3-step agent. No network, no API key. Used as a fallback so the rest of
  the pipeline runs even with nothing configured.
- **`agent-claude.ts`** — runs the agent on the first-party Anthropic API.
- **`agent-bedrock.ts`** — runs it on Amazon Bedrock instead (Converse API, over plain `fetch`).
  Same agent, different model — the audit layer doesn't care which LLM made the decisions.
- **`run-agent.ts`** — picks one of the three above based on which credentials are present.
- **`datasets.ts`** — writes the market data the agent reads into its own Walrus blob first, so
  the run can later prove which exact data it acted on.
- **`manifest.ts`** — the run's "proof object": agent identity, covenant, the hash-chained log,
  and a signature over the chain head. Also re-verifies a manifest on its own
  (`verifyRunManifest`) — signatures, the hash chain, and that the agent stayed inside its policy.
- **`sink.ts`** — saves a manifest to Walrus and reads it back (`WalrusReceiptSink`).
- **`anchor.ts`** — calls the Move contract to record the run on Sui, and reads the anchor back.
- **`verify.ts`** — the payoff. Given just a Sui object ID, rebuilds the entire chain of trust
  from public data and returns a list of pass/fail checks.

## Wiring and helpers

- **`config.ts`** — every endpoint, on-chain address, and default in one place.
- **`env.ts`** — Node-only setup (loads `.env`, bumps network timeouts, reads the keypair).
- **`walrus-client.ts`** — builds the Sui+Walrus client; kept separate so the verifier can be
  imported without dragging in Node-only code.
- **`index.ts`** — re-exports the public pieces so the SDK can be imported as one package.

## Scripts you actually run

These map to the `bun run …` commands in `package.json`:

- `keygen.ts` — make a Sui wallet · `agent-keys.ts` — make the agent's stable identity
- `setup-wallet.ts` — swap some SUI for WAL (Walrus storage token) · `balances.ts` — check funds
- `record-run.ts` — run the agent and store it on Walrus
- `anchor-run.ts` — same, then anchor it on Sui
- `verify-run.ts` — verify a run from its anchor ID

## Tests

`manifest.test.ts` covers the parts that must not silently break: the hash chain is
deterministic, a tampered receipt fails verification, the covenant-compliance check catches a
forbidden action logged as allowed, and the cited-data match works. Run with `bun test`.
