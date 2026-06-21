# Proof-of-Agent

A verifiable audit layer for AI agents. Wrap any agent and every action becomes a
[Nobulex](https://nobulex.com)-signed, hash-chained receipt, persisted on
[Walrus](https://www.walrus.xyz/) and anchored on [Sui](https://sui.io). Anyone can
**independently replay and verify** an agent's entire history from a single Sui object ID.

> From one Sui object ID, anyone can re-prove **what an AI agent did**, that it **stayed inside its
> policy**, and that it **used exactly the data it claims** — using only public data and the immutable
> Walrus blob the contract bound on-chain.

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
input data ─► Walrus blob (cited)
                   │
                   ▼
Agent action ─► covenant check ─► Nobulex hash-chained receipt ─► run manifest ─► Walrus blob ─► Sui anchor
                                                                                                     │
                            anyone, from just a Sui object ID ◄──────────────────────────────────────┘
              re-verifies: signatures + hash chain + covenant compliance + cited input blobs
```

## Components

- **SDK** (`src/`) — runs an agent, records each action as a hash-chained receipt, persists the run to Walrus, and re-verifies it.
- **`audit_anchor` Move package** (`contracts/`) — reads the real Walrus `Blob` on-chain and anchors the receipt-chain head + agent identity + covenant hash, emitting a `RunAnchored` event.
- **Verifier** (`web/`) — a web app that, given a Sui object ID, reconstructs trust entirely from public data.

## The covenant-governed agent

The live agent is a portfolio-risk assistant driven by an LLM — the first-party Anthropic API, or
**any tool-calling model on Amazon Bedrock** (the audit layer is model-agnostic by design). Its policy
is written once in [Nobulex CCL](https://nobulex.com) and used twice — to build the signed covenant
*and* to enforce every tool call at runtime, so what the agent is permitted to do can never drift from
what the covenant promises:

```
permit read on '/market/**'
permit analyze on '/market/**'
permit notify on '/owner/**'
deny  read on '/secrets/**'
deny  notify on '/public/**'
```

Each tool the model invokes is mapped to a governed `(action, resource)` pair, checked against the
covenant before it runs, and recorded as a receipt — with a `blocked` outcome if the covenant denies
it. The demo task deliberately tempts the agent into reading `/secrets/**`; the covenant **blocks it**,
and the blocked attempt is itself a signed receipt in the chain.

It runs on either **the first-party Anthropic API** (`ANTHROPIC_API_KEY`) or **Amazon Bedrock**
(`AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION`); without either, the pipeline falls back to a
deterministic simulated agent, so every step below works offline too.

### Verifiable input provenance

The market data the agent consumes is itself written to Walrus as a content-addressed blob, and the
agent **cites that blob ID** in its run. The verifier re-fetches each cited blob and confirms the
figures the agent recorded match the blob's contents — proving *provable inputs → provable process →
provable output*, all content-addressed on Walrus.

### What the verifier proves (12 checks, from a single object ID)

It reads the on-chain anchor, confirms the referenced object is a **genuine Walrus `Blob`** whose
`blob_id` matches, reloads the manifest from Walrus, then independently re-checks: the receipt hash
chain and every Ed25519 signature; that the agent **obeyed its covenant** (re-evaluating the policy
over every logged action, including the blocked one); that the manifest matches the anchored chain
root / agent / covenant; and that the **cited input blobs match the recorded data**. Tamper with any
receipt and it fails at the exact broken step.

## Stack

Bun + TypeScript + Move. The agent runs on the first-party Anthropic API (`claude-opus-4-8`) or any
tool-calling Amazon Bedrock model (default `mistral.mistral-large-3`). Runs on Sui + Walrus testnet.

## Setup

```bash
bun install
bun run keygen            # prints a Sui address + secret key
cp .env.example .env      # set SUI_PRIVATE_KEY to the printed secret
# fund the address with testnet SUI, then:
bun run setup             # swaps 0.5 SUI -> WAL (Walrus storage token)
bun run balances          # check SUI + WAL
bun run agent-keys        # prints AGENT_PRIVATE_KEY + ISSUER_PRIVATE_KEY -> paste into .env
                          # (stable agent identity across runs)
# optional, for the live agent: set AUDIT_ANCHOR_PACKAGE_ID and either
#   ANTHROPIC_API_KEY  (first-party)  or  AWS_BEARER_TOKEN_BEDROCK + AWS_REGION  (Bedrock)
```

## Run a full audit cycle

```bash
bun run record-run            # agent runs -> manifest -> Walrus blob -> re-read + verify
bun run anchor                # full pipeline: agent -> Walrus -> Sui anchor; prints the anchor object ID
bun run verify <anchorObjectId>   # re-verifies everything from the anchor alone (10/10 -> VERIFIED)
```

Then launch the public verifier:

```bash
cd web && bun run dev     # http://localhost:3000 — paste an anchor object ID, or use the examples
```

## Two-minute demo script

1. **Run the agent.** `bun run record-run` — the agent reads market data (from Walrus), scores risk,
   and briefs the owner. It also *tries to read the owner's secrets* — and the covenant **blocks it**.
   Every step, including the block, is a signed, hash-chained receipt.
2. **Persist + anchor.** The manifest lands on Walrus (content-addressed) and is anchored on Sui
   against the real `Blob` object, read on-chain. You get a single Sui object ID.
3. **Verify from nothing but that ID.** Open the web app, click **Verify an example run**. It reads the
   anchor, confirms the genuine Walrus blob, reloads the manifest, re-checks every signature and the
   hash chain, **re-proves the agent obeyed its covenant** (the blocked `/secrets` read shows in the
   timeline), and **re-fetches the cited input blob** to confirm the agent used exactly that data —
   ending in a green **Verified** (12/12). Nothing private is needed.
4. **Tamper.** Click **Tamper a receipt** — one byte is flipped and verification fails at the exact
   broken step (`actionLog.integrity` + the recomputed chain root), proving the chain is real, not
   decorative. Note that *"manifest chain root matches anchored chain_root"* still passes — the
   committed head on Sui wasn't touched; independent recomputation of the chain from the altered data
   simply disagrees with it. You can't edit the data and slip through, because the math is redone, not
   trusted.

## Deploy the verifier (Vercel)

The verifier is read-only and needs no secrets (it uses a public Sui RPC), which makes it the ideal
public entry point. Deploy `web/` with **Root Directory = `proof-of-agent/web`** — the build reaches
the sibling `../src` via `experimental.externalDir`, and the Mysten SDKs are declared in
`web/package.json` so they resolve at runtime. No environment variables required.

## Project layout

```
src/         SDK + CLI: agent, manifest, Walrus sink, Sui anchor, verifier
contracts/   audit_anchor Move package (reads the real Walrus Blob on-chain)
web/         Next.js public verifier
```
