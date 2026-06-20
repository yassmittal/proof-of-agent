# Proof-of-Agent

A verifiable audit layer for AI agents. Wrap any agent and every action becomes a
[Nobulex](https://nobulex.com)-signed, hash-chained receipt, persisted on
[Walrus](https://www.walrus.xyz/) and anchored on [Sui](https://sui.io). Anyone can
**independently replay and verify** an agent's entire history from a single Sui object ID.

## Why

Nobulex makes agent behavior cryptographically provable — Ed25519 receipts, hash-chained into a
tamper-evident log, governed by covenants. But those receipts need a durable, neutral home: if they
live on the operator's own server, the operator can rewrite history, which defeats the point.

Walrus is that home — immutable, decentralized, content-addressed storage where a blob's ID *is* the
hash of its contents. And because every Walrus blob is bound to a Sui object, the proof is anchored
on-chain for free. Together: provable behavior (Nobulex) + permanent proof (Walrus) + on-chain
finality (Sui).

## How it works

```
Agent action ─► Nobulex hash-chained receipt ─► run manifest ─► Walrus blob ─► Sui anchor
                                                                                   │
                          anyone, from just a Sui object ID ◄──────────────────────┘
                          re-verifies signatures + chain + covenant + cited data
```

## Components

- **SDK** (`src/`) — runs an agent, records each action as a hash-chained receipt, persists the run to Walrus, and re-verifies it.
- **`audit_anchor` Move package** (`contracts/`) — reads the real Walrus `Blob` on-chain and anchors the receipt-chain head + agent identity + covenant hash, emitting a `RunAnchored` event.
- **Verifier** (`web/`) — a web app that, given a Sui object ID, reconstructs trust entirely from public data.

## The covenant-governed agent

The live agent is a portfolio-risk assistant powered by Claude. Its policy is written once in
[Nobulex CCL](https://nobulex.com) and used twice — to build the signed covenant *and* to enforce
every tool call at runtime, so what the agent is permitted to do can never drift from what the
covenant promises:

```
permit read on '/market/**'
permit analyze on '/market/**'
permit notify on '/owner/**'
deny  read on '/secrets/**'
deny  notify on '/public/**'
```

Each tool the model invokes is mapped to a governed `(action, resource)` pair, checked against the
covenant before it runs, and recorded as a receipt — with a `blocked` outcome if the covenant denies
it. Set `ANTHROPIC_API_KEY` to run it; without a key the pipeline falls back to a deterministic
simulated agent, so every step below works offline too.

## Stack

Bun + TypeScript + Move. Claude (`claude-opus-4-8`) drives the agent. Runs on Sui + Walrus testnet.

## Setup

```bash
bun install
bun run keygen            # prints a Sui address + secret key
cp .env.example .env      # set SUI_PRIVATE_KEY to the printed secret
# fund the address with testnet SUI, then:
bun run setup             # swaps 0.5 SUI -> WAL (Walrus storage token)
bun run balances          # check SUI + WAL
# optional, for the live agent: set ANTHROPIC_API_KEY and AUDIT_ANCHOR_PACKAGE_ID in .env
```

## Run a full audit cycle

```bash
bun run record-run        # agent runs -> manifest -> Walrus blob; prints { blobId, suiObjectId }
bun run anchor <suiObjectId> <chainRoot>   # anchors the run on Sui; prints the anchor object ID
bun run verify <anchorObjectId>            # re-verifies everything from the anchor alone (10/10 -> VERIFIED)
```

Then launch the public verifier:

```bash
cd web && bun run dev     # http://localhost:3000 — paste an anchor object ID, or "Try an example"
```

## Two-minute demo script

1. **Run the agent.** `bun run record-run` — Claude reads market data, scores risk, and briefs the
   owner. Every step is checked against the covenant and recorded as a signed, hash-chained receipt.
2. **Persist + anchor.** The run manifest lands on Walrus (content-addressed) and is anchored on Sui
   against the real `Blob` object. You get a single Sui object ID.
3. **Verify from nothing but that ID.** Open the web app, paste the ID. It reads the on-chain anchor,
   confirms the genuine Walrus blob, reloads the manifest, and re-checks every Ed25519 signature and
   the receipt hash chain — ending in a green **Verified**. Nothing private is needed.
4. **Tamper.** Flip one byte in a receipt (`bun test` includes this case) and verification fails at
   the exact broken step — proving the chain is real, not decorative.

## Project layout

```
src/         SDK + CLI: agent, manifest, Walrus sink, Sui anchor, verifier
contracts/   audit_anchor Move package (reads the real Walrus Blob on-chain)
web/         Next.js public verifier
```
