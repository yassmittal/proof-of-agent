<p align="center">
  <img src="web/public/logo-transparent.png" alt="Proof-of-Agent" width="110" />
</p>

<h1 align="center">Proof-of-Agent</h1>

A way to make an AI agent's actions provable. You wrap an agent, and every move it makes becomes a
signed, hash-chained receipt. The whole run gets stored on [Walrus](https://www.walrus.xyz/) and
anchored on [Sui](https://sui.io). After that, anyone can take a single Sui object ID and replay
the entire run — checking the signatures, the chain, and the policy themselves — without trusting
the operator or any server.

In one line: from one object ID, you can re-prove what the agent did, that it stayed inside its
policy, and that it used exactly the data it claims — all from public data.

## The problem this solves

[Nobulex](https://nobulex.com) already makes agent behavior provable: Ed25519 receipts, chained
together so the log can't be edited, governed by covenants (permit/deny policies). The catch is
that those receipts have to live somewhere. If they sit on the operator's own server, the operator
can quietly rewrite history — which defeats the whole point of having proof.

Walrus fixes that. It's content-addressed storage, so a blob's ID *is* the hash of what's inside
it — you can't swap the contents without the ID changing. And every Walrus blob is tied to a Sui
object, so anchoring it on-chain comes almost for free. Put together: Nobulex proves the behavior,
Walrus makes the proof permanent, Sui makes it final.

## How it works

```
input data ─► Walrus blob (cited)
                   │
                   ▼
Agent action ─► covenant check ─► hash-chained receipt ─► run manifest ─► Walrus blob ─► Sui anchor
                                                                                            │
                       anyone, from just a Sui object ID ◄─────────────────────────────────┘
            re-verifies: signatures + hash chain + covenant compliance + cited input blobs
```

Three parts do the work:

- **`src/`** — the SDK and CLI. Runs the agent, writes the receipts, stores them on Walrus, calls
  the contract, and verifies the result.
- **`contracts/`** — a small Move package (`audit_anchor`) that reads the real Walrus `Blob`
  on-chain and freezes an immutable record of the run.
- **`web/`** — the verifier you can click through: paste an object ID, watch it check out.

Each folder has its own README if you want the detail.

## The agent and its covenant

The demo agent is a portfolio-risk assistant. It doesn't matter much which model drives it — the
point is the audit layer around it — so it runs on either the Anthropic API or any tool-calling
model on Amazon Bedrock, and falls back to a deterministic stand-in when no credentials are set.

Its policy is written once, in Nobulex CCL, and used for two things at once: building the signed
covenant *and* enforcing every tool call at runtime. That's deliberate — it means what the agent is
allowed to do can never drift away from what the covenant promises.

```
permit read on '/market/**'
permit analyze on '/market/**'
permit notify on '/owner/**'
deny  read on '/secrets/**'
deny  notify on '/public/**'
```

Every tool the model calls maps to an `(action, resource)` pair that gets checked against this
policy before it runs, and recorded either way. The demo task deliberately tempts the agent into
reading `/secrets/**` — the covenant blocks it, and that blocked attempt becomes a signed receipt
just like the allowed ones. (A blocked action isn't a failure; it's the guardrail working, and the
proof captures it.)

The input data matters too. The market figures the agent reads are written to Walrus first, as
their own content-addressed blob, and the agent cites that blob's ID in the run. So the verifier
can later re-fetch the exact data the agent used and confirm it matches what was logged — provable
input, not just a provable log.

## What the verifier checks

Given only a Sui object ID, it runs twelve checks: the referenced object really is a Walrus `Blob`
whose ID matches the anchor; the manifest is readable from Walrus; the hash chain and every
signature hold up; the agent stayed inside its covenant (the policy is re-run over every logged
action, including the blocked one); the manifest lines up with the anchored chain root, agent, and
covenant; and the cited input blobs match the recorded data. Tamper with any receipt and it fails
at the exact step that broke.

## Setup

```bash
bun install
bun run keygen            # prints a Sui address + secret key
cp .env.example .env      # set SUI_PRIVATE_KEY to the printed secret
# fund the address with testnet SUI, then:
bun run setup             # swaps 0.5 SUI -> WAL (Walrus's storage token)
bun run balances          # check SUI + WAL
bun run agent-keys        # prints AGENT_PRIVATE_KEY + ISSUER_PRIVATE_KEY -> paste into .env
                          # (gives the agent a stable identity across runs)
# to run a real agent, also set AUDIT_ANCHOR_PACKAGE_ID and one of:
#   ANTHROPIC_API_KEY                       (Anthropic)
#   AWS_BEARER_TOKEN_BEDROCK + AWS_REGION   (Bedrock)
```

## Running it

```bash
bun run record-run             # run the agent -> store on Walrus -> read back and verify
bun run anchor                 # same, then anchor it on Sui (prints the anchor object ID)
bun run verify <anchorObjectId>  # verify a run from its ID alone (12/12 -> VERIFIED)
```

And the web verifier:

```bash
cd web && bun run dev          # http://localhost:3000 — paste an ID, or use the example buttons
```

## The two-minute demo

1. **Run the agent** — `bun run record-run`. It reads market data from Walrus, scores the risk,
   briefs the owner, and along the way tries to read the owner's secrets — which the covenant
   blocks. Every step, the block included, is a signed receipt.
2. **Store and anchor** — the run lands on Walrus, and the contract anchors it on Sui by reading
   the real blob on-chain. You walk away with one object ID.
3. **Verify from that ID** — open the web app, hit *Verify an example run*. It pulls the anchor,
   confirms the Walrus blob, re-checks the signatures and the chain, re-proves the agent obeyed its
   policy (you'll see the blocked `/secrets` read in the timeline), and re-fetches the cited input
   to confirm the data — ending green, 12 for 12. Nothing private needed.
4. **Tamper** — hit *Tamper a receipt*. One byte flips and verification fails at the exact broken
   step. Worth noting: "manifest chain root matches anchored chain_root" still passes, because the
   value committed to Sui was never touched — it's the independent recomputation from the altered
   data that disagrees. You can't edit the data and slip through, because the math gets redone
   rather than trusted.

## Hosting the verifier

The verifier is read-only and needs no secrets, so it's the easiest thing to put online. On Vercel,
set the root directory to `proof-of-agent/web` — the build reaches `../src` through
`experimental.externalDir`, and the Mysten SDKs are listed in `web/package.json` so they're there
at runtime. If the public Sui RPC ever goes down, point `SUI_RPC_URL` at another testnet gRPC
endpoint and both the app and CLI follow.

## Layout

```
src/         the SDK and CLI — agent, receipts, Walrus, Sui, verifier
contracts/   the audit_anchor Move package
web/         the Next.js verifier
```

Built with Bun, TypeScript, and Move, on Sui + Walrus testnet.
