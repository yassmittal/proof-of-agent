# Proof-of-Agent

A verifiable audit layer for AI agents. Wrap any agent → every action becomes a
[Nobulex](https://nobulex.com)-signed, hash-chained receipt → persisted on
[Walrus](https://www.walrus.xyz/) → anchored on [Sui](https://sui.io). Anyone can
**independently replay and verify** an agent's entire history from a single Sui object ID.

> Sui Overflow 2026 — Walrus track. Toolchain: **Bun** + TypeScript + Move.

## Why
Nobulex makes agent behavior cryptographically provable (Ed25519 bilateral receipts, covenants,
Trust Capital) but has **no durable storage**. Walrus is the missing piece: an immutable,
content-addressed home for the receipt chain — and every Walrus blob is already a Sui object, so
on-chain anchoring is half-built. See `../TODO.md` for the full plan and build journal.

## Layout
- `src/` — Phase 0/1 scripts (wallet setup, core loop). Promoted to `packages/*` at Phase 2.
- `contracts/` — `audit_anchor.move` (Phase 3).
- `verifier/` — trustless replay web app (Phase 4).

## Setup
```bash
bun install
bun run keygen            # prints a Sui address + secret; put secret in .env
cp .env.example .env      # then set SUI_PRIVATE_KEY
# fund the address with testnet SUI, then:
bun run setup             # swaps 0.5 SUI -> WAL
bun run balances          # check SUI + WAL
```
