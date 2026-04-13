# Agent Commerce

Standalone service for **Solana settlement**, **x402-style** paid HTTP, **wallet linking**, and **payment intents** next to [Paperclip](https://github.com/paperclipai/paperclip).

**How people install each piece**

| Product | Typical install | Needs full GitHub clone? |
|---------|-----------------|---------------------------|
| **Paperclip** | [`paperclipai` on npm](https://www.npmjs.com/package/paperclipai) — `pnpm dlx paperclipai`, `npm i -g paperclipai`, or add as a dependency | **No** — customers use the published CLI/package |
| **Agent Commerce** | This repository (clone) or your own image / Helm chart | **Yes, for now** — an npm package is **not** published yet (see [Distribution](#distribution-today-vs-future)) |

Commerce only needs Paperclip’s **HTTP origin** (`base_url`) and a **bearer token**; it does not care whether Paperclip was installed from npm, pnpm, or a container.

## Layout

- `docs/PRD.md` — product requirements (no Paperclip code changes).
- `src/` — Hono HTTP API, Drizzle schema, services.
- `drizzle/` — SQL migrations.

## Quick start

Install **without** joining a parent pnpm workspace:

```sh
cd agent-commerce
pnpm install --ignore-workspace
cp .env.example .env   # sets DATABASE_URL to localhost:5433 — matches docker-compose.yml
docker compose up -d
pnpm db:migrate   # reads DATABASE_URL from .env (via drizzle.config.ts + dotenv)
pnpm dev
```

- API: `http://localhost:3210` (override with `PORT` in `.env`).
- Health: `GET /health` → `{"ok":true,"service":"agent-commerce"}`

`pnpm dev` and `pnpm db:migrate` read **`DATABASE_URL`** from the environment or from `.env` (via `dotenv` when starting the server). If you skip `.env`, export it explicitly, for example:

```sh
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/agent_commerce
pnpm db:migrate && pnpm dev
```

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

## Install Paperclip for integration (npm · no clone)

Most operators **do not** clone the Paperclip monorepo. They install the published CLI:

```sh
# examples — use whichever matches your workflow
pnpm dlx paperclipai --help
# or
npm install -g paperclipai
paperclipai --help
```

Start Paperclip per [upstream docs](https://github.com/paperclipai/paperclip); note the **origin URL** and port (often `http://localhost:3100`). Use that value as Commerce `base_url` when calling `PUT /v1/paperclip-connection`.

## Distribution (today vs future)

- **Today:** run Agent Commerce from this repo (`pnpm dev` / `pnpm build` + `pnpm start`) or bake the `dist/` output into your own container image.
- **Future:** publishing a versioned npm package (e.g. CLI or library) is possible but **not done yet**; track releases in this repo when that lands.

## Paperclip integration guide

Agent Commerce does **not** modify Paperclip or call private Paperclip internals. It stores **correlation IDs** (`paperclip_company_id`, `paperclip_agent_id`, `issue_id`, …) as opaque UUID strings so your exports line up with Paperclip’s data model.

### 1. What runs where

| System | Role |
|--------|------|
| **Paperclip** | Tasks, org chart, heartbeats, token budgets, board UI, agent API keys for *work*. |
| **Agent Commerce** | On-chain / x402 payment intents, linked Solana pubkeys, commerce policy, audit log for *money*. |

An **agent runtime** (your adapter process, script, or worker) typically talks to **both** HTTP APIs with **different credentials**.

### 2. Configure the bridge in Agent Commerce

After you bootstrap a tenant and have a Commerce `apiKey`:

1. **Base URL** — Paperclip origin only, no trailing path. Examples: `http://localhost:3100`, `https://paperclip.example.com` (Paperclip serves the API under `/api/...` on the same origin in normal setups).

2. **API key** — A credential Paperclip accepts on `Authorization: Bearer …` for the calls you care about. Common choices:
   - **Board / operator** session or token (if your deployment exposes one for server-to-server use), or  
   - An **agent API key** created in Paperclip for a bot that is allowed to read company-scoped resources.

3. Store them in Commerce:

```sh
curl -sS -X PUT http://localhost:3210/v1/paperclip-connection \
  -H "Authorization: Bearer $COMMERCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"base_url\":\"http://localhost:3100\",\"api_key\":\"$PAPERCLIP_BEARER_TOKEN\"}"
```

4. **Verify connectivity** (Commerce calls Paperclip `GET /api/health`; if that returns 401/403, Commerce retries with the stored bearer):

```sh
curl -sS http://localhost:3210/v1/paperclip/ping \
  -H "Authorization: Bearer $COMMERCE_API_KEY"
```

### 3. IDs and correlation

Use the same UUID strings Paperclip shows in the UI or returns from its REST API:

| Commerce field | Paperclip meaning |
|----------------|-------------------|
| `paperclip_company_id` | Company id (`companies.id`). |
| `paperclip_agent_id` / `payer_agent_id` / `payee_agent_id` | Agent id (`agents.id`). |
| `issue_id` (optional) | Issue id when the payment ties to a task. |

**Useful Paperclip read endpoints** (paths are under `/api`; prefix with your `base_url`). Adjust host/port to your deployment:

- `GET /api/health` — liveness (used by Commerce ping).
- `GET /api/companies` — list companies (when authenticated as board).
- `GET /api/companies/:companyId/agents` — list agents for correlation and UI.
- `GET /api/agents/:id` — agent detail (e.g. `status`, `pause_reason`) for future **pause sync** / guardrails.
- `GET /api/companies/:companyId/issues` — issues for linking `issue_id` on intents.

Commerce **does not** implement these calls end-to-end in v1 beyond `/paperclip/ping`; extend your services or scripts to pull Paperclip JSON as needed, then POST the same ids into Commerce.

### 4. Recommended operator workflow

1. Run Paperclip and Agent Commerce; migrate Commerce DB (`pnpm db:migrate`).
2. Create a Commerce tenant; save the **Commerce** `apiKey`.
3. `PUT /v1/paperclip-connection` with Paperclip `base_url` + **Paperclip** bearer.
4. In Paperclip, copy **company** and **agent** UUIDs from the board or API.
5. `POST /v1/agent-wallets` to attach a Solana `pubkey` to each `(company_id, agent_id)` pair; complete challenge/verify when you want verified wallets.
6. Create **payment intents** with the same UUIDs so ledgers join cleanly in BI (export Commerce + export Paperclip, join on ids).

### 5. Agent runtime pattern (dual API keys)

- **Paperclip** `Authorization: Bearer <paperclip_agent_api_key>` — checkout tasks, post comments, report costs, heartbeats.
- **Agent Commerce** `Authorization: Bearer <commerce_api_key>` — create intents, post transitions, record `x402_receipts`.

Never send the Commerce key to Paperclip or vice versa unless you intentionally reuse a single secret (not recommended).

### 6. Security and production notes

- Commerce stores the Paperclip bearer **in Postgres** for the bridge — acceptable for dev; for production prefer a **secret manager**, short-lived tokens, or a dedicated Paperclip **read-only** service user if you add one upstream.
- Set **`BOOTSTRAP_ADMIN_TOKEN`** in production so `POST /v1/tenants` is not open.
- Use **`PATCH /v1/settings`** with `commerce_frozen: true` to halt new approvals/submissions during an incident.
- Pin a **Paperclip release version** in your runbook; Commerce does not validate every Paperclip response shape.

### 7. Pause and budget alignment

Commerce can enforce its own `commerce_frozen` flag. **Automatic** “block payouts when Paperclip pauses this agent” is not wired in v1: implement a small poller that calls Paperclip `GET /api/agents/:id` and then toggles Commerce policy or calls `PATCH /v1/settings` if you want strict coupling.

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Watch mode API server |
| `pnpm build` / `pnpm start` | Production compile + run |
| `pnpm db:generate` | Regenerate SQL from `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations (requires `DATABASE_URL`) |
| `pnpm db:push` | Push schema directly (dev only) |

### 8. Checkout beside Paperclip

If this repo lives inside a Paperclip working tree, the parent repo may **gitignore** `agent-commerce/` so the nested `.git` is not part of Paperclip commits. That is intentional: Agent Commerce stays a **separate** git remote and release cadence.

## Remote

```sh
git remote add origin git@github.com:YOUR_ORG/agent-commerce.git
git push -u origin main
```
