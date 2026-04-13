CREATE TABLE "agent_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"paperclip_company_id" text NOT NULL,
	"paperclip_agent_id" text NOT NULL,
	"pubkey" text NOT NULL,
	"verification_nonce" text,
	"verification_nonce_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paperclip_connections" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"paperclip_company_id" text NOT NULL,
	"payer_agent_id" text NOT NULL,
	"payee_agent_id" text,
	"payee_pubkey" text,
	"mint" text NOT NULL,
	"amount_atomic" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"issue_id" text,
	"goal_id" text,
	"metadata" jsonb,
	"signature" text,
	"slot" bigint,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_sha256" text NOT NULL,
	"name" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_api_keys_token_sha256_unique" UNIQUE("token_sha256")
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"caip2_network" text DEFAULT 'solana:devnet' NOT NULL,
	"default_mint" text,
	"rpc_url" text,
	"commerce_frozen" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "x402_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"intent_id" uuid,
	"resource_url" text NOT NULL,
	"proof_json" jsonb NOT NULL,
	"cost_atomic" text,
	"mint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_wallets" ADD CONSTRAINT "agent_wallets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paperclip_connections" ADD CONSTRAINT "paperclip_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intent_events" ADD CONSTRAINT "payment_intent_events_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x402_receipts" ADD CONSTRAINT "x402_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "x402_receipts" ADD CONSTRAINT "x402_receipts_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallets_tenant_company_agent_idx" ON "agent_wallets" USING btree ("tenant_id","paperclip_company_id","paperclip_agent_id");--> statement-breakpoint
CREATE INDEX "agent_wallets_tenant_idx" ON "agent_wallets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_intent_events_intent_idx" ON "payment_intent_events" USING btree ("intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_tenant_idempotency_idx" ON "payment_intents" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_intents_tenant_status_idx" ON "payment_intents" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "tenant_api_keys_tenant_idx" ON "tenant_api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "x402_receipts_tenant_idx" ON "x402_receipts" USING btree ("tenant_id");