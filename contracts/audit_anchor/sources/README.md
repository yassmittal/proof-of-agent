# sources

The Move source for the `audit_anchor` package. One file:

- **`audit_anchor.move`** — defines the `AuditAnchor` object, the `RunAnchored` event, and the
  `anchor_run` function that reads a Walrus `Blob`'s IDs on-chain, freezes an immutable anchor,
  and emits the event.

It's deliberately tiny. All the agent logic, signing, and verification happen off-chain in the
TypeScript SDK — the contract only exists to make a run's fingerprint permanent and public.
