# Agent Commerce

Standalone service for **Solana settlement**, **x402-style** paid HTTP, **wallet linking**, and **payment intents** next to [Paperclip](https://github.com/paperclipai/paperclip). This repo is intentionally **not** part of the Paperclip monorepo: it can live beside a Paperclip checkout for local development.

## Layout

- `docs/PRD.md` — product requirements (no Paperclip code changes).
- `src/` — Hono HTTP API, Drizzle schema, services.
- `drizzle/` — SQL migrations.

## Quick start

Install **without** joining a parent pnpm workspace:

```sh
cd agent-commerce
pnpm install --ignore-workspace
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

- API: `http://localhost:3210` (override with `PORT`).
- Health: `GET /health`

### Bootstrap tenant

If `BOOTSTRAP_ADMIN_TOKEN` is unset in `.env`, `POST /v1/tenants` is open (dev only). With it set:

```sh
curl -sS -X POST http://localhost:3210/v1/tenants \
  -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo","slug":"demo"}'
```

Save the returned `apiKey`; use `Authorization: Bearer <apiKey>` for all other `/v1/*` routes.

### Core endpoints (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/me` | Tenant + settings |
| PUT | `/v1/paperclip-connection` | Store Paperclip `base_url` + `api_key` |
| GET | `/v1/paperclip-connection` | Masked secret + base URL |
| GET | `/v1/paperclip/ping` | Call Paperclip `/api/health` |
| GET/PATCH | `/v1/settings` | CAIP-2 network, default mint, RPC URL, `commerce_frozen` |
| GET/POST | `/v1/agent-wallets` | Link Solana pubkey to Paperclip agent |
| GET | `/v1/agent-wallets/:id/challenge` | Nonce for ed25519 verify |
| POST | `/v1/agent-wallets/:id/verify` | Verify `signature_base64` over challenge |
| GET/POST | `/v1/intents` | Create / list payment intents |
| GET | `/v1/intents/:id` | Intent detail |
| GET | `/v1/intents/:id/events` | State transition log |
| POST | `/v1/intents/:id/transition` | `request_approval`, `approve`, `submit`, `confirm`, etc. |
| POST | `/v1/x402-receipts` | Record paid-HTTP proof from an agent runtime |

Intent state machine: `draft` → `pending_approval` → `approved` → `submitted` → `confirmed` (see `src/services/intents.ts`).

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Watch mode API server |
| `pnpm build` / `pnpm start` | Production compile + run |
| `pnpm db:generate` | Regenerate SQL from `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations (requires `DATABASE_URL`) |
| `pnpm db:push` | Push schema directly (dev only) |

## Paperclip parent repo

If this folder sits inside a Paperclip checkout, that repo may list `agent-commerce/` in `.gitignore` so the nested `.git` is not committed into Paperclip. Treat this directory as its **own** git remote.

## Remote

```sh
git remote add origin git@github.com:YOUR_ORG/agent-commerce.git
git push -u origin main
```
