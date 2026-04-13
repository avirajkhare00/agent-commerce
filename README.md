# Agent Commerce

Standalone service for **Solana settlement**, **x402-style** paid HTTP, **wallet linking**, and **payment intents** next to [Paperclip](https://github.com/paperclipai/paperclip). This repo is intentionally **not** part of the Paperclip monorepo: it lives under the same parent directory for local convenience only.

## Layout

- `docs/PRD.md` — product requirements (zero changes to Paperclip core).
- `src/` — placeholder; replace with API server, workers, and UI as you implement.

## Paperclip parent repo

The Paperclip checkout at `../` lists `agent-commerce/` in `.gitignore` so this nested git repository is not committed into Paperclip. Clone or back up this folder separately (or push `agent-commerce` to its own remote).

## Quick start

From this directory, install **without** joining the parent Paperclip pnpm workspace:

```sh
cd agent-commerce
pnpm install --ignore-workspace
pnpm typecheck
```

If you use plain npm instead: `npm install && npm run typecheck`.

## Remote

After `git init`, add your own origin:

```sh
git remote add origin <your-git-url>
git push -u origin main
```
