# contracts

The on-chain side of the project. Right now there's one Move package, `audit_anchor`, which is
what turns a stored run into something permanent and public on Sui.

The TypeScript SDK in `../src` does the heavy lifting (running the agent, writing to Walrus); the
contract's only job is to take the result and pin it on-chain so nobody — including the operator —
can quietly change or delete it later.

See `audit_anchor/` for the package itself.
