# web

The public verifier — a small Next.js app. You paste a Sui anchor object ID, it checks the run,
and shows you a green-or-red breakdown. No wallet, no login, nothing private; it only reads public
data.

## How it's put together

The actual verification doesn't run in your browser. The page sends the object ID to a server
route (`app/api/verify`), which calls the same `verifyAnchor` from the SDK in `../src` that the CLI
uses, and sends back the list of checks. The browser just draws the result.

Doing it server-side was a deliberate choice: the Walrus SDK ships a WebAssembly file that breaks
when bundled for the browser, so it stays on the server. That's why `next.config.ts` marks the
Mysten packages as external and points at the sibling `../src` directory.

## Run it

```bash
bun run dev      # http://localhost:3000
```

There are two buttons to try without an ID: **Verify an example run** (an already-anchored run,
turns green) and **Tamper a receipt** (flips a byte server-side so you can watch it fail at the
exact broken step).

## Deploy

It's read-only and needs no environment variables, which makes it the easiest thing to host.
Deploy on Vercel with the root directory set to `proof-of-agent/web`. If the public Sui RPC ever
has a bad day, set `SUI_RPC_URL` to another testnet gRPC endpoint — both the app and the CLI pick
it up.

## Layout

- `app/` — the page, the API route, layout and styles.
- `public/` — leftover default Next.js icons; not really used.
- `next.config.ts` / `tsconfig.json` — the config that lets the app reach `../src` and keeps the
  Walrus SDK external.
