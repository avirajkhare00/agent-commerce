import { db } from "../db/client.js";
import { x402Receipts } from "../db/schema.js";
import { writeAudit } from "./audit.js";

export async function recordReceipt(input: {
  tenantId: string;
  intentId?: string | null;
  resourceUrl: string;
  proofJson: Record<string, unknown>;
  costAtomic?: string | null;
  mint?: string | null;
}) {
  const [row] = await db
    .insert(x402Receipts)
    .values({
      tenantId: input.tenantId,
      intentId: input.intentId ?? null,
      resourceUrl: input.resourceUrl,
      proofJson: input.proofJson,
      costAtomic: input.costAtomic ?? null,
      mint: input.mint ?? null,
    })
    .returning();

  await writeAudit({
    tenantId: input.tenantId,
    action: "x402_receipt.recorded",
    entityType: "x402_receipt",
    entityId: row!.id,
    payload: { resourceUrl: input.resourceUrl },
  });

  return row!;
}
