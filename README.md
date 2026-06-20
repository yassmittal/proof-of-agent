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

- **SDK** — wraps an agent, records each action as a hash-chained receipt, and persists the run to Walrus.
- **`audit_anchor` Move package** — records the receipt-chain head + manifest blob on Sui.
- **Verifier** — a web app that, given a Sui object ID, reconstructs trust entirely from public data.

## Stack

Bun + TypeScript + Move. Runs on Sui + Walrus testnet.

## Setup

```bash
bun install
bun run keygen            # prints a Sui address + secret key
cp .env.example .env      # set SUI_PRIVATE_KEY to the printed secret
# fund the address with testnet SUI, then:
bun run setup             # swaps 0.5 SUI -> WAL (Walrus storage token)
bun run balances          # check SUI + WAL
```
