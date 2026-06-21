# api/verify

The one server endpoint behind the verifier.

`route.ts` handles `POST /api/verify`. It takes `{ anchorObjectId, tamper? }`, builds a read-only
Sui+Walrus client, and runs the SDK's `verifyAnchor`. The full report (every check, the manifest,
the on-chain anchor) goes back as JSON for the page to render.

A couple of details worth knowing:

- It runs on the Node.js runtime, not the edge — the Walrus SDK needs it.
- `tamper: true` is the demo switch. It tells the verifier to flip a byte of the manifest after
  reading it, which makes verification fail at the exact step it should. Off by default.
- If the Sui RPC node is unreachable, it returns a `503` with a plain "temporarily unavailable"
  message instead of a raw error — so an outage never gets mistaken for a failed (or tampered) run.

This file is the only place the website touches the chain. Everything else is presentation.
