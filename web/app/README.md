# app

The Next.js App Router lives here. It's a one-page app, so there isn't much.

- **`page.tsx`** — the whole UI. An input for the anchor object ID, the two example buttons, and
  the result view: the Verified/Failed badge, the agent's actions (with a red chip on any the
  covenant blocked), the inputs it re-fetched from Walrus, and the full check timeline. It's a
  client component that POSTs to the API route and renders whatever comes back.
- **`layout.tsx`** — the root layout and page title.
- **`globals.css`** — the dark theme and color variables (the greens and reds you see on checks).
- **`page.module.css`** — styles scoped to the page.
- **`api/verify/`** — the server endpoint that does the actual verification (see its README).
- **`favicon.ico`** — the tab icon.

To change what a passing/failing run looks like, you're almost always editing `page.tsx` and
`page.module.css`. To change *what gets checked*, that's in the SDK (`../../src/verify.ts`), not
here.
