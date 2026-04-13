import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { bootstrapAuth } from "./middleware/bootstrap-auth.js";
import { tenantAuth } from "./middleware/tenant-auth.js";
import { HttpError } from "./lib/errors.js";
import { createTenant, getTenant } from "./services/tenants.js";
import { getSettings, patchSettings } from "./services/settings.js";
import { setPaperclipConnection, getPaperclipConnection, pingPaperclip } from "./services/paperclip.js";
import { upsertWallet, listWallets, issueChallenge, verifyWallet } from "./services/wallets.js";
import { createIntent, getIntent, listIntents, transitionIntent } from "./services/intents.js";
import { listIntentEvents } from "./services/intent-events.js";
import { recordReceipt } from "./services/x402.js";
import type { HonoEnv } from "./types/hono.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as ContentfulStatusCode,
    );
  }
  console.error(err);
  return c.json({ error: { code: "internal_error", message: "Internal server error" } }, 500);
});

app.get("/health", (c) => c.json({ ok: true, service: "agent-commerce" }));

const v1 = new Hono();

v1.post("/tenants", bootstrapAuth, async (c) => {
  const body = z
    .object({
      name: z.string().min(1).max(200),
      slug: z
        .string()
        .min(2)
        .max(64)
        .regex(/^[a-z0-9-]+$/),
    })
    .parse(await c.req.json());
  const { tenant, apiKey } = await createTenant(body);
  return c.json({ tenant, apiKey }, 201);
});

const authed = new Hono<HonoEnv>();
authed.use(tenantAuth);

authed.get("/me", async (c) => {
  const tenantId = c.get("tenantId");
  const tenant = await getTenant(tenantId);
  const settings = await getSettings(tenantId);
  return c.json({ tenant, settings });
});

authed.put("/paperclip-connection", async (c) => {
  const body = z
    .object({
      base_url: z.string().url(),
      api_key: z.string().min(1),
    })
    .parse(await c.req.json());
  await setPaperclipConnection({
    tenantId: c.get("tenantId"),
    baseUrl: body.base_url,
    apiKey: body.api_key,
  });
  return c.json({ ok: true });
});

authed.get("/paperclip-connection", async (c) => {
  const row = await getPaperclipConnection(c.get("tenantId"));
  if (!row) return c.json({ configured: false });
  const masked =
    row.apiKey.length > 8 ? `${row.apiKey.slice(0, 4)}…${row.apiKey.slice(-4)}` : "(set)";
  return c.json({
    configured: true,
    base_url: row.baseUrl,
    api_key_masked: masked,
    updated_at: row.updatedAt,
  });
});

authed.get("/paperclip/ping", async (c) => {
  const result = await pingPaperclip(c.get("tenantId"));
  return c.json(result);
});

authed.get("/settings", async (c) => {
  const settings = await getSettings(c.get("tenantId"));
  return c.json({ settings });
});

authed.patch("/settings", async (c) => {
  const body = z
    .object({
      caip2_network: z.string().min(1).optional(),
      default_mint: z.string().nullable().optional(),
      rpc_url: z.string().url().nullable().optional(),
      commerce_frozen: z.boolean().optional(),
    })
    .parse(await c.req.json());
  const settings = await patchSettings(c.get("tenantId"), {
    caip2Network: body.caip2_network,
    defaultMint: body.default_mint,
    rpcUrl: body.rpc_url,
    commerceFrozen: body.commerce_frozen,
  });
  return c.json({ settings });
});

authed.get("/agent-wallets", async (c) => {
  const companyId = c.req.query("paperclip_company_id") ?? undefined;
  const rows = await listWallets(c.get("tenantId"), companyId);
  return c.json({ wallets: rows });
});

authed.post("/agent-wallets", async (c) => {
  const body = z
    .object({
      paperclip_company_id: z.string().uuid(),
      paperclip_agent_id: z.string().uuid(),
      pubkey: z.string().min(32).max(50),
    })
    .parse(await c.req.json());
  const row = await upsertWallet({
    tenantId: c.get("tenantId"),
    paperclipCompanyId: body.paperclip_company_id,
    paperclipAgentId: body.paperclip_agent_id,
    pubkey: body.pubkey,
  });
  return c.json({ wallet: row }, 201);
});

authed.get("/agent-wallets/:walletId/challenge", async (c) => {
  const out = await issueChallenge(c.get("tenantId"), c.req.param("walletId"));
  return c.json(out);
});

authed.post("/agent-wallets/:walletId/verify", async (c) => {
  const body = z.object({ signature_base64: z.string().min(1) }).parse(await c.req.json());
  const wallet = await verifyWallet({
    tenantId: c.get("tenantId"),
    walletId: c.req.param("walletId"),
    signatureBase64: body.signature_base64,
  });
  return c.json({ wallet });
});

authed.get("/intents", async (c) => {
  const status = c.req.query("status") ?? undefined;
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "50")));
  const rows = await listIntents(c.get("tenantId"), { status, limit });
  return c.json({ intents: rows });
});

authed.post("/intents", async (c) => {
  const body = z
    .object({
      paperclip_company_id: z.string().uuid(),
      payer_agent_id: z.string().uuid(),
      payee_agent_id: z.string().uuid().optional(),
      payee_pubkey: z.string().optional(),
      mint: z.string().min(32).max(64),
      amount_atomic: z.string().regex(/^\d+$/),
      idempotency_key: z.string().min(8).max(200),
      issue_id: z.string().uuid().optional(),
      goal_id: z.string().uuid().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .parse(await c.req.json());

  const row = await createIntent({
    tenantId: c.get("tenantId"),
    paperclipCompanyId: body.paperclip_company_id,
    payerAgentId: body.payer_agent_id,
    payeeAgentId: body.payee_agent_id ?? null,
    payeePubkey: body.payee_pubkey ?? null,
    mint: body.mint,
    amountAtomic: body.amount_atomic,
    idempotencyKey: body.idempotency_key,
    issueId: body.issue_id ?? null,
    goalId: body.goal_id ?? null,
    metadata: body.metadata ?? null,
    actorType: "api_key",
    actorId: null,
  });
  return c.json({ intent: row }, 201);
});

authed.get("/intents/:intentId", async (c) => {
  const row = await getIntent(c.get("tenantId"), c.req.param("intentId"));
  return c.json({ intent: row });
});

authed.get("/intents/:intentId/events", async (c) => {
  const rows = await listIntentEvents(c.get("tenantId"), c.req.param("intentId"));
  return c.json({ events: rows });
});

authed.post("/intents/:intentId/transition", async (c) => {
  const body = z
    .object({
      action: z.enum([
        "request_approval",
        "approve",
        "reject",
        "submit",
        "confirm",
        "fail",
        "cancel",
      ]),
      signature: z.string().optional(),
      slot: z.number().int().nonnegative().optional(),
      failure_reason: z.string().max(2000).optional(),
      note: z.string().max(500).optional(),
    })
    .parse(await c.req.json());

  if (body.action === "confirm" && !body.signature) {
    throw new HttpError(400, "invalid_body", "signature is required for confirm");
  }

  const intent = await transitionIntent({
    tenantId: c.get("tenantId"),
    intentId: c.req.param("intentId"),
    action: body.action,
    actorType: "api_key",
    actorId: null,
    note: body.note ?? null,
    signature: body.signature ?? null,
    slot: body.slot ?? null,
    failureReason: body.failure_reason ?? null,
  });

  return c.json({ intent });
});

authed.post("/x402-receipts", async (c) => {
  const body = z
    .object({
      resource_url: z.string().url(),
      proof_json: z.record(z.unknown()),
      intent_id: z.string().uuid().optional(),
      cost_atomic: z.string().regex(/^\d+$/).optional(),
      mint: z.string().optional(),
    })
    .parse(await c.req.json());

  const row = await recordReceipt({
    tenantId: c.get("tenantId"),
    intentId: body.intent_id ?? null,
    resourceUrl: body.resource_url,
    proofJson: body.proof_json,
    costAtomic: body.cost_atomic ?? null,
    mint: body.mint ?? null,
  });
  return c.json({ receipt: row }, 201);
});

v1.route("/", authed);
app.route("/v1", v1);

export { app };
