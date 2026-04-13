import { createMiddleware } from "hono/factory";
import { HttpError } from "../lib/errors.js";

/** Protects tenant bootstrap (`POST /v1/tenants`). */
export const bootstrapAuth = createMiddleware(async (c, next) => {
  const expected = process.env.BOOTSTRAP_ADMIN_TOKEN;
  if (!expected) {
    await next();
    return;
  }
  const header = c.req.header("authorization");
  const m = header?.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1] || m[1].trim() !== expected) {
    throw new HttpError(401, "unauthorized", "Invalid bootstrap token");
  }
  await next();
});
