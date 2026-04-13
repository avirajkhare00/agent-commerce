import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export async function writeAudit(input: {
  tenantId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    tenantId: input.tenantId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? null,
  });
}
