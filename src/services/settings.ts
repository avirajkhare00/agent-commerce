import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tenantSettings } from "../db/schema.js";
import { writeAudit } from "./audit.js";

export async function getSettings(tenantId: string) {
  return db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).then((r) => r[0] ?? null);
}

export async function patchSettings(
  tenantId: string,
  patch: Partial<{
    caip2Network: string;
    defaultMint: string | null;
    rpcUrl: string | null;
    commerceFrozen: boolean;
  }>,
) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) updates[k] = v;
  }
  const [row] = await db
    .update(tenantSettings)
    .set(updates as typeof tenantSettings.$inferInsert)
    .where(eq(tenantSettings.tenantId, tenantId))
    .returning();

  await writeAudit({
    tenantId,
    action: "tenant_settings.patched",
    entityType: "tenant_settings",
    entityId: tenantId,
    payload: patch,
  });

  return row;
}
