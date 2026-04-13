import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { paymentIntentEvents } from "../db/schema.js";
import { getIntent } from "./intents.js";

export async function listIntentEvents(tenantId: string, intentId: string) {
  await getIntent(tenantId, intentId);
  return db
    .select()
    .from(paymentIntentEvents)
    .where(eq(paymentIntentEvents.intentId, intentId))
    .orderBy(desc(paymentIntentEvents.createdAt));
}
