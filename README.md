# Agent Commerce

Standalone service for **Solana settlement**, **x402-style** paid HTTP, **wallet linking**, and **payment intents** next to [Paperclip](https://github.com/paperclipai/paperclip).

**How people install each piece**

| Product | Typical install | Needs full GitHub clone? |
|---------|-----------------|---------------------------|
| **Paperclip** | [`paperclipai` on npm](https://www.npmjs.com/package/paperclipai) — `pnpm dlx paperclipai`, `npm i -g paperclipai`, or add as a dependency | **No** — customers use the published CLI/package |
| **Paperclip → Commerce UI (optional)** | [`@avirajkhare/agent-commerce-bridge` on npm](https://www.npmjs.com/package/@avirajkhare/agent-commerce-bridge) — install from the Paperclip board **Plugins** UI | **No** |
| **Agent Commerce** (this API) | This repository ([`avirajkhare00/agent-commerce`](https://github.com/avirajkhare00/agent-commerce)) — clone, Docker, or your own image | **Yes, for now** — the HTTP service is source-first (see [Distribution](#distribution-today-vs-future)) |

Commerce only needs Paperclip’s **HTTP origin** (`base_url`) and a **bearer token**; it does not care whether Paperclip was installed from npm, pnpm, or a container.

## Paperclip board plugin (`@avirajkhare/agent-commerce-bridge`)

Use this when you want a **Commerce console inside Paperclip** (tenant, Paperclip bridge, wallets, intents) without cloning Paperclip to add code.

- **npm:** [https://www.npmjs.com/package/@avirajkhare/agent-commerce-bridge](https://www.npmjs.com/package/@avirajkhare/agent-commerce-bridge)  
- **Stable plugin id:** `avirajkhare.agent-commerce-bridge`

### 1) Run Agent Commerce

Follow [Quick start](#quick-start) in this repo. Note your API origin (e.g. `http://127.0.0.1:3210` from `PORT` in `.env`).

### 2) Create a tenant and get the **tenant API key**

If `BOOTSTRAP_ADMIN_TOKEN` is set in `.env`:

```sh
curl -sS -X POST "http://127.0.0.1:3210/v1/tenants" \
  -H "Authorization: Bearer $BOOTSTRAP_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My team","slug":"my-unique-slug"}'
```

Copy **`apiKey`** from the JSON. That value is **only shown once** — it is **not** the same as `BOOTSTRAP_ADMIN_TOKEN` (bootstrap is only for creating tenants).

Use `Authorization: Bearer <apiKey>` for all `/v1/*` routes below.

### 3) Install the plugin in Paperclip

1. Open the Paperclip board → **Plugins** (or **Settings → Plugins**).
2. **Install** → package name: `@avirajkhare/agent-commerce-bridge`
3. Open the plugin **configuration** and set:
   - **`commerce_api_base_url`** — Commerce origin only, no path (e.g. `http://127.0.0.1:3210`).
   - **`commerce_tenant_api_key`** — the tenant **`apiKey`** from step 2 (paste the raw secret; do **not** prefix with `Bearer `).

### 4) Configure the **Paperclip ↔ Commerce** bridge (required for `/v1/paperclip/ping`)

Commerce stores how to reach Paperclip (`base_url` + optional bearer for `/api/health`):

```sh
export COMMERCE_API_KEY='paste-tenant-apiKey-here'
curl -sS -X PUT "http://127.0.0.1:3210/v1/paperclip-connection" \
  -H "Authorization: Bearer $COMMERCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"base_url":"http://127.0.0.1:3100","api_key":"x"}'
```

Replace `base_url` with your real Paperclip origin. If `/api/health` is public in your deployment, `api_key` can be any non-empty placeholder (`x`); otherwise use a Paperclip bearer that can read `/api/health`.

Verify:

```sh
curl -sS "http://127.0.0.1:3210/v1/paperclip/ping" \
  -H "Authorization: Bearer $COMMERCE_API_KEY"
```

Expect `ok: true` and a `url` pointing at `{base_url}/api/health`.

### 5) Localhost / mixed-content notes

- If Paperclip’s plugin runtime **blocks HTTP requests to `127.0.0.1`**, use a **public HTTPS** Commerce URL, a **tunnel** (e.g. ngrok), or follow your Paperclip version’s docs for outbound plugin HTTP to private addresses.
- If the board is **HTTPS** and Commerce is **HTTP**, the plugin worker can still call Commerce from the server; prefer HTTPS for Commerce in production.

### 6) Using the console

After install, open **Commerce** in the company sidebar. Tabs cover **Overview**, **Tenant**, **Paperclip bridge**, **Wallets**, and **Intents**. Open the page from a **company URL** so company-scoped actions (wallets, new intents) have a `companyId`.

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

### First start with `paperclipai onboard -y` (headless / CI)

Quickstart **embedded PostgreSQL** can race on the very first `paperclipai run` (migrations still applying while the server boots). If you see `relation "heartbeat_runs" does not exist`, either **run `paperclipai run` again** or point Paperclip at a **real Postgres** before onboarding so migrations finish cleanly:

```sh
# Example: dedicated Postgres for Paperclip only
docker run -d --name paperclip-pg -e POSTGRES_PASSWORD=pcsecret -e POSTGRES_DB=paperclip -p 55432:5432 postgres:16-alpine

export DATABASE_URL='postgres://postgres:pcsecret@127.0.0.1:55432/paperclip'
export PORT=3150   # avoid clashing with another Paperclip on 3100
rm -rf /tmp/paperclip-home && npx paperclipai@latest onboard -y -d /tmp/paperclip-home
# onboard ends inside `paperclipai run`; server listens on http://127.0.0.1:3150
```

Then wire Agent Commerce (replace `COMMERCE_API_KEY` with the value from `POST /v1/tenants`):

```sh
curl -sS -X PUT http://127.0.0.1:3210/v1/paperclip-connection \
  -H "Authorization: Bearer $COMMERCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"base_url":"http://127.0.0.1:3150","api_key":"optional-if-health-is-public"}'

curl -sS http://127.0.0.1:3210/v1/paperclip/ping \
  -H "Authorization: Bearer $COMMERCE_API_KEY"
# expect: {"ok":true,"status":200,"url":"http://127.0.0.1:3150/api/health"}
```

In **local_trusted** mode, `/api/health` is usually reachable **without** a bearer; Commerce still stores an `api_key` string (any placeholder is fine) and only sends it if the first unauthenticated request returns 401/403.

## Distribution (today vs future)

- **Today:** run Agent Commerce from this repo (`pnpm dev` / `pnpm build` + `pnpm start`) or bake the `dist/` output into your own container image.
- **Paperclip UI:** the optional board plugin is published as **`@avirajkhare/agent-commerce-bridge`** on npm (see [Paperclip board plugin](#paperclip-board-plugin-avirajkhareagent-commerce-bridge) above).
- **Future:** a versioned npm package for the **Commerce API server itself** (CLI/library) is still possible; track releases in this repo when that lands.

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

Upstream for this service:

**[https://github.com/avirajkhare00/agent-commerce](https://github.com/avirajkhare00/agent-commerce)**

```sh
git remote add origin git@github.com:avirajkhare00/agent-commerce.git
git push -u origin main
```
