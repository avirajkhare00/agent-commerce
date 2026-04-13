import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { paymentIntentEvents, paymentIntents, tenantSettings } from "../db/schema.js";
import type { IntentStatus } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { writeAudit } from "./audit.js";

const transitions: Record<IntentStatus, Partial<Record<string, IntentStatus>>> = {
  draft: { request_approval: "pending_approval", cancel: "cancelled" },
  pending_approval: { approve: "approved", reject: "cancelled", cancel: "cancelled" },
  approved: { submit: "submitted", cancel: "cancelled" },
  signing: { submit: "submitted", cancel: "cancelled" },
  submitted: { confirm: "confirmed", fail: "failed" },
  confirmed: {},
  failed: {},
  cancelled: {},
};

function nextStatus(current: IntentStatus, action: string): IntentStatus | null {
  const row = transitions[current];
  if (!row) return null;
  return row[action] ?? null;
}

export async function createIntent(input: {
  tenantId: string;
  paperclipCompanyId: string;
  payerAgentId: string;
  payeeAgentId?: string | null;
  payeePubkey?: string | null;
  mint: string;
  amountAtomic: string;
  idempotencyKey: string;
  issueId?: string | null;
  goalId?: string | null;
  metadata?: Record<string, unknown> | null;
  actorType: string;
  actorId?: string | null;
}) {
  const frozen = await db
    .select({ commerceFrozen: tenantSettings.commerceFrozen })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, input.tenantId))
    .then((r) => r[0]?.commerceFrozen ?? false);
  if (frozen) throw new HttpError(403, "commerce_frozen", "Commerce is frozen for this tenant");

  const inserted = await db
    .insert(paymentIntents)
    .values({
      tenantId: input.tenantId,
      status: "draft",
      paperclipCompanyId: input.paperclipCompanyId,
      payerAgentId: input.payerAgentId,
      payeeAgentId: input.payeeAgentId ?? null,
      payeePubkey: input.payeePubkey ?? null,
      mint: input.mint,
      amountAtomic: input.amountAtomic,
      idempotencyKey: input.idempotencyKey,
      issueId: input.issueId ?? null,
      goalId: input.goalId ?? null,
      metadata: input.metadata ?? null,
    })
    .onConflictDoNothing({ target: [paymentIntents.tenantId, paymentIntents.idempotencyKey] })
    .returning();

  const row =
    inserted[0] ??
    (await db
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, input.tenantId),
          eq(paymentIntents.idempotencyKey, input.idempotencyKey),
        ),
      )
      .then((r) => r[0]));

  if (!row) throw new HttpError(500, "intent_create_failed", "Failed to create intent");

  if (inserted[0]) {
    await db.insert(paymentIntentEvents).values({
      intentId: row.id,
      fromStatus: null,
      toStatus: "draft",
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      note: "created",
    });

    await writeAudit({
      tenantId: input.tenantId,
      action: "payment_intent.created",
      entityType: "payment_intent",
      entityId: row.id,
      payload: { status: row.status },
    });
  }

  return row;
}

export async function getIntent(tenantId: string, intentId: string) {
  const row = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.tenantId, tenantId)))
    .then((r) => r[0]);
  if (!row) throw new HttpError(404, "not_found", "Intent not found");
  return row;
}

export async function listIntents(tenantId: string, opts: { status?: string; limit: number }) {
  if (opts.status) {
    return db
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.tenantId, tenantId), eq(paymentIntents.status, opts.status)))
      .orderBy(desc(paymentIntents.createdAt))
      .limit(opts.limit);
  }
  return db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.tenantId, tenantId))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(opts.limit);
}

export async function transitionIntent(input: {
  tenantId: string;
  intentId: string;
  action: string;
  actorType: string;
  actorId?: string | null;
  note?: string | null;
  /** For confirm / submit */
  signature?: string | null;
  slot?: number | null;
  failureReason?: string | null;
}) {
  const intent = await getIntent(input.tenantId, input.intentId);
  const current = intent.status as IntentStatus;
  const next = nextStatus(current, input.action);
  if (!next) throw new HttpError(409, "invalid_transition", `Cannot ${input.action} from ${current}`);

  const frozen = await db
    .select({ commerceFrozen: tenantSettings.commerceFrozen })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, input.tenantId))
    .then((r) => r[0]?.commerceFrozen ?? false);
  if (frozen && ["approve", "submit", "confirm"].includes(input.action)) {
    throw new HttpError(403, "commerce_frozen", "Commerce is frozen for this tenant");
  }

  const patch: Partial<typeof paymentIntents.$inferInsert> = {
    status: next,
    updatedAt: new Date(),
  };
  if (input.signature != null) patch.signature = input.signature;
  if (input.slot != null) patch.slot = input.slot;
  if (input.failureReason != null) patch.failureReason = input.failureReason;

  await db
    .update(paymentIntents)
    .set(patch)
    .where(and(eq(paymentIntents.id, intent.id), eq(paymentIntents.tenantId, input.tenantId)));

  await db.insert(paymentIntentEvents).values({
    intentId: intent.id,
    fromStatus: current,
    toStatus: next,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    note: input.note ?? input.action,
  });

  await writeAudit({
    tenantId: input.tenantId,
    action: `payment_intent.${input.action}`,
    entityType: "payment_intent",
    entityId: intent.id,
    payload: { from: current, to: next },
  });

  return getIntent(input.tenantId, intent.id);
}
