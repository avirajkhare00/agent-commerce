import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tenantApiKeys, tenantSettings, tenants } from "../db/schema.js";
import { generateOpaqueToken, sha256Hex } from "../lib/hash.js";
import { writeAudit } from "./audit.js";

export async function createTenant(input: { name: string; slug: string }) {
  const apiKey = generateOpaqueToken();
  const tokenSha256 = sha256Hex(apiKey);

  const tenantId = await db.transaction(async (tx) => {
    const [t] = await tx.insert(tenants).values({ name: input.name, slug: input.slug }).returning();
    if (!t) throw new Error("tenant insert failed");
    await tx.insert(tenantApiKeys).values({
      tenantId: t.id,
      tokenSha256,
      name: "default",
    });
    await tx.insert(tenantSettings).values({
      tenantId: t.id,
      caip2Network: "solana:devnet",
      defaultMint: null,
      rpcUrl: null,
      commerceFrozen: false,
    });
    return t.id;
  });

  await writeAudit({
    tenantId,
    action: "tenant.created",
    entityType: "tenant",
    entityId: tenantId,
    payload: { slug: input.slug },
  });

  const tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId)).then((r) => r[0]);
  return { tenant: tenant!, apiKey };
}

export async function getTenant(tenantId: string) {
  return db.select().from(tenants).where(eq(tenants.id, tenantId)).then((r) => r[0] ?? null);
}
