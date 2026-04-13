# PRD: Agent Commerce Service (Solana / x402) — Paperclip-adjacent, zero repo touch

**Status:** Draft for review  
**Date:** 2026-04-13  
**Constraint:** **No changes to the Paperclip application repository** (no core, no `packages/db`, no `server/` routes, no Paperclip UI, no Paperclip-hosted plugins). This document describes a **separate product** that interoperates with Paperclip only through **public, versioned HTTP APIs** and optional **webhooks you configure outside Paperclip**.

**Audience:** Product and engineering building the commerce service; operators who already run Paperclip  
**Context (read-only):** Paperclip `doc/PRODUCT.md`, `doc/SPEC-implementation.md` — vocabulary alignment only; not implementation targets inside Paperclip.

---

## 1. Summary

**Paperclip** remains the control plane for org structure, tasks, heartbeats, token budgets, and board visibility. **Agent Commerce** is a **standalone deployable** (own repo, own database, own UI) that handles **Solana settlement**, **x402-style** paid HTTP flows, **wallet linking**, **payment intents**, **policy**, and **audit logs** for on-chain spend.

**Product thesis:** Commerce logic, Solana dependencies, and signing UX live entirely outside Paperclip. Paperclip continues to orchestrate *work*; the commerce service orchestrates *money movement* and optionally **mirrors context** (company id, agent id, issue id) by **reading** Paperclip’s API using credentials the operator provisions.

---

## 2. Problem Statement

1. Operators want **agent-to-agent and agent-to-API** payments without forking or extending Paperclip.
2. They still want **correlation**: “this signature was for agent A paying agent B while working issue #123.”
3. **Guardrails** (limits, approvals, pause) must exist in the commerce layer; **alignment** with Paperclip pause/budget is **best-effort via API polling or events**, not shared DB rows.

---

## 3. Goals

| ID | Goal |
|----|------|
| G1 | **Tenant-scoped** payment intents with stable foreign keys: `paperclipCompanyId`, `payerAgentId`, `payeeAgentId` (optional), optional `issueId` / `goalId` as **opaque strings** from Paperclip. |
| G2 | **Observable** in the commerce UI and exports (CSV/JSON API); full **audit trail** inside the commerce service DB. |
| G3 | **Governed:** approvals, spend caps, allowlists; **block** outbound actions when commerce policy or operator-set **freeze** is on. |
| G4 | **Zero Paperclip code:** integration only via **documented Paperclip REST** (board session or API keys as Paperclip already defines) plus optional **outbound webhooks from Paperclip** if and when upstream adds generic webhooks—until then, **poll** or **agent-reported correlation**. |
| G5 | **Reconcilable:** every confirmed chain tx stored with `signature`, `slot`, `mint`, `amountAtomic`, links to intent + Paperclip correlation ids. |
| G6 | **Interoperable:** SPL/USDC transfers between linked pubkeys; **x402** client flows for paid HTTP from **agent runtime**, with commerce service recording **proof + cost** when the runtime reports back. |

---

## 4. Non-Goals

- **N0:** Shipping commerce features **inside** the Paperclip git tree (this repository is the implementation home).
- **N1:** Paperclip or the commerce vendor as **custodian** of user seed phrases (v1).
- **N2:** Cross-product shared database or direct Postgres access to Paperclip’s DB.
- **N3:** Automatically mutating Paperclip **budget** or **finance_events** from the commerce service (optional **manual** or **future** upstream feature—not required here).

---

## 5. Personas & Primary User Stories

**Board operator (commerce UI)**

- Link Paperclip **base URL + credentials** once per environment.
- Map **Paperclip agents** to **pubkeys** (commerce DB); verify ownership via signed challenge.
- Approve/reject intents; view explorer links.

**Agent runtime** (unchanged Paperclip adapters + optional commerce client)

- Create intent via **commerce service API** with `Authorization` to commerce (not Paperclip).
- Optionally **fetch** payer/payee pubkeys from commerce; sign txs in runtime or hand off to signer.

**Auditor**

- Export commerce ledger; join offline to Paperclip exports using `paperclipCompanyId` / `issueId`.

---

## 6. Functional Requirements

### 6.1 Paperclip bridge (read-only / optional)

- **FR-P0:** Commerce service can **list agents** and **issues** for a company using Paperclip’s existing APIs (exact routes per deployed Paperclip version); cache with TTL.
- **FR-P1:** **No write** to Paperclip required for v1. If correlation is missing, intents may carry **free-form metadata** only.

### 6.2 Identity & configuration (commerce DB)

- **FR-1:** Store per-agent **Solana** `pubkey`, verification, `paperclipAgentId`, `paperclipCompanyId`.
- **FR-2:** Per-tenant RPC (Helius, etc.), default mint, network id (CAIP-2 if using x402 v2).
- **FR-3:** Secrets in commerce **secret store** (env, KMS, Vault)—never returned to clients.

### 6.3 Payment intents

- **FR-10:** State machine: `draft` → `pending_approval` → `approved` → `signing` → `submitted` → `confirmed` | `failed` | `cancelled`.
- **FR-11:** Fields include `paperclipCompanyId`, `payerAgentId`, optional `payeeAgentId`, optional `payeePubkey`, `mint`, `amountAtomic`, `idempotencyKey`, optional `issueId`.
- **FR-12:** Agent-facing commerce API creates intents subject to policy; board approves in commerce UI.

### 6.4 Settlement

- **FR-20:** Commerce backend builds **unsigned** VersionedTransaction; signer is browser, extension, or operator signer microservice.
- **FR-21:** Confirm via RPC poll or **Helius** webhook → persist finality fields on intent.
- **FR-22:** Optional **Carbon** / custom indexer only inside commerce infra for custom programs.

### 6.5 x402

- **FR-30:** SDK usage lives in **agent runtime** or small **commerce-side proxy**; commerce records **proof + URL + cost** when reported.
- **FR-31:** Optional dev **mock 402** server in commerce repo for tests.

### 6.6 Governance

- **FR-50:** Commerce service enforces its own authN/Z (board users vs agent tokens issued by commerce—not Paperclip agent keys unless you deliberately reuse them as opaque secrets).
- **FR-51:** Audit log table for all mutating actions.
- **FR-52:** Optional **Paperclip agent pause** sync: poll `GET /api/.../agents/:id` (or equivalent) and block approve/submit if Paperclip reports paused—**best-effort**, documented latency.

---

## 7. Non-Functional Requirements

Same security/reliability/observability themes as before (NFR-1–4), applied to the **commerce service** codebase and operators’ deployment.

---

## 8. Architecture (Decision: standalone only)

| Option | In scope for this PRD? |
|--------|-------------------------|
| **A. Standalone commerce service + own UI** | **Yes — canonical** |
| **B. Separate npm libs only** | Yes, as libraries consumed by **A** or by agent runtimes |
| **C. Paperclip plugin / core / DB changes** | **No — explicitly out of scope** |

**Integration boundary**

```
┌─────────────────────┐         HTTPS (read APIs, optional)          ┌──────────────────────┐
│  Paperclip (frozen) │ ◄─────────────────────────────────────────── │  Agent Commerce      │
│  tasks, agents,     │                                            │  intents, wallets,   │
│  budgets, issues    │   Agent runtime talks to BOTH              │  Solana, x402 logs   │
└─────────────────────┘ ───────────────────────────────────────────► └──────────────────────┘
         ▲                                                                        ▲
         │                                                                        │
         └────────────── agent / board calls per existing Paperclip docs ─────────┘
```

---

## 9. Data Model Strategy

All tables live in the **commerce service** database (e.g. Postgres): `tenants`, `paperclip_connections`, `agent_wallets`, `payment_intents`, `intent_events`, `audit_log`, optional `x402_receipts`.

**No** reliance on `finance_events` in Paperclip; unified CFO view is **export + join** in spreadsheet/BI, unless you later choose an upstream contribution to Paperclip (outside this PRD).

---

## 10. Integration Approach (no Paperclip changes)

### Phase 0 — Spike

- Devnet transfers; mock x402; pick signing UX.

### Phase 1 — Commerce-only MVP

- Deploy commerce service + DB; board UI for **Paperclip connection** (base URL + token) and **manual entry** of `paperclipAgentId` if API listing is deferred.
- Pubkey link + verify.

### Phase 2 — Intents + manual signing

- Intent flow end-to-end in commerce UI; RPC confirm.

### Phase 3 — Policy + agent API

- Commerce-issued **agent tokens** or mTLS for runtime; limits and allowlists.

### Phase 4 — Hardening

- Helius webhooks, optional Anchor program + Carbon in **commerce** repo; TukTuk for schedules; Solana Agent Kit in **runtime** only.

### Paperclip alignment

- Document for operators: **dual API keys** (Paperclip agent key for work, commerce key for pay)—or board-only commerce if agents never initiate pay.
- **Pause sync:** polling job in commerce service; document known delay.

---

## 11. Dependencies on External Projects

Unchanged from prior stack list (x402-solana, x402-secure, Helius, Jupiter, Pyth, Anchor, Carbon, TukTuk, Light, Solana Agent Kit, Frames-class wallets if desired)—all pulled into the **commerce** repo, not Paperclip.

---

## 12. Risks & Open Questions

- **R1:** Drift between Paperclip API versions and commerce bridge—**pin** Paperclip version in compatibility matrix.
- **R2:** Duplicate identity if operators mis-link `paperclipAgentId`—mitigate with **verify** flows and read-back from Paperclip API.
- **Q1:** Should commerce issue **per-agent** tokens or only **board** delegation? (Affects threat model.)

---

## 13. Success Metrics

- First **devnet** payment through **commerce UI** without modifying Paperclip.
- 100% of confirmed txs have audit + intent correlation ids.
- Published **operator runbook**: env vars, Paperclip permissions needed, and network diagram.

---

## 14. Repository location

Canonical PRD path: **`docs/PRD.md`** in this repository. When checked out next to Paperclip, a typical layout is `paperclip/agent-commerce/` (Paperclip’s `.gitignore` excludes this folder from the Paperclip repo).

---

## 15. Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Product | | | ☐ |
| Engineering | | | ☐ |
| Security review | | | ☐ |
