import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** Operator / deployment partition (multi-tenant). */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** API keys for `Authorization: Bearer <token>` (token shown once at creation). */
export const tenantApiKeys = pgTable(
  "tenant_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** sha256(hex) of opaque bearer token for constant-size lookup. */
    tokenSha256: text("token_sha256").notNull().unique(),
    name: text("name").notNull().default("default"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tenant_api_keys_tenant_idx").on(t.tenantId),
  }),
);

/** Paperclip REST bridge (one row per tenant). */
export const paperclipConnections = pgTable("paperclip_connections", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull(),
  /** Dev convenience: store bearer token; use secret manager in production. */
  apiKey: text("api_key").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Solana pubkey linked to a Paperclip agent (opaque string ids from Paperclip). */
export const agentWallets = pgTable(
  "agent_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    paperclipCompanyId: text("paperclip_company_id").notNull(),
    paperclipAgentId: text("paperclip_agent_id").notNull(),
    pubkey: text("pubkey").notNull(),
    verificationNonce: text("verification_nonce"),
    verificationNonceExpiresAt: timestamp("verification_nonce_expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqAgent: uniqueIndex("agent_wallets_tenant_company_agent_idx").on(
      t.tenantId,
      t.paperclipCompanyId,
      t.paperclipAgentId,
    ),
    tenantIdx: index("agent_wallets_tenant_idx").on(t.tenantId),
  }),
);

export const intentStatusEnum = [
  "draft",
  "pending_approval",
  "approved",
  "signing",
  "submitted",
  "confirmed",
  "failed",
  "cancelled",
] as const;
export type IntentStatus = (typeof intentStatusEnum)[number];

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    paperclipCompanyId: text("paperclip_company_id").notNull(),
    payerAgentId: text("payer_agent_id").notNull(),
    payeeAgentId: text("payee_agent_id"),
    payeePubkey: text("payee_pubkey"),
    mint: text("mint").notNull(),
    /** String integer (token smallest units). */
    amountAtomic: text("amount_atomic").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    issueId: text("issue_id"),
    goalId: text("goal_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    signature: text("signature"),
    slot: bigint("slot", { mode: "number" }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idem: uniqueIndex("payment_intents_tenant_idempotency_idx").on(t.tenantId, t.idempotencyKey),
    tenantStatusIdx: index("payment_intents_tenant_status_idx").on(t.tenantId, t.status),
  }),
);

export const paymentIntentEvents = pgTable(
  "payment_intent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    intentIdx: index("payment_intent_events_intent_idx").on(t.intentId),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("audit_log_tenant_idx").on(t.tenantId),
  }),
);

/** Optional x402 / paid-HTTP receipts reported by agent runtimes. */
export const x402Receipts = pgTable(
  "x402_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    intentId: uuid("intent_id").references(() => paymentIntents.id, { onDelete: "set null" }),
    resourceUrl: text("resource_url").notNull(),
    proofJson: jsonb("proof_json").$type<Record<string, unknown>>().notNull(),
    costAtomic: text("cost_atomic"),
    mint: text("mint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("x402_receipts_tenant_idx").on(t.tenantId),
  }),
);

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** e.g. solana:mainnet-beta */
  caip2Network: text("caip2_network").notNull().default("solana:devnet"),
  defaultMint: text("default_mint"),
  rpcUrl: text("rpc_url"),
  /** When true, block approve/submit on new outbound intents. */
  commerceFrozen: boolean("commerce_frozen").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
