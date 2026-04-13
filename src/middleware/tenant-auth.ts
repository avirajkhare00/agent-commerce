import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tenantApiKeys } from "../db/schema.js";
import { sha256Hex } from "../lib/hash.js";
import { HttpError } from "../lib/errors.js";
import type { HonoEnv } from "../types/hono.js";

export const tenantAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const header = c.req.header("authorization");
  const m = header?.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) throw new HttpError(401, "unauthorized", "Missing Bearer token");

  const token = m[1].trim();
  const tokenSha256 = sha256Hex(token);

  const row = await db
    .select({ tenantId: tenantApiKeys.tenantId })
    .from(tenantApiKeys)
    .where(eq(tenantApiKeys.tokenSha256, tokenSha256))
    .then((r) => r[0]);

  if (!row) throw new HttpError(401, "unauthorized", "Invalid API token");

  c.set("tenantId", row.tenantId);
  await next();
});
