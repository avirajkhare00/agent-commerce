import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { paperclipConnections } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { writeAudit } from "./audit.js";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export async function setPaperclipConnection(input: {
  tenantId: string;
  baseUrl: string;
  apiKey: string;
}) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  await db
    .insert(paperclipConnections)
    .values({
      tenantId: input.tenantId,
      baseUrl,
      apiKey: input.apiKey,
    })
    .onConflictDoUpdate({
      target: paperclipConnections.tenantId,
      set: { baseUrl, apiKey: input.apiKey, updatedAt: new Date() },
    });

  await writeAudit({
    tenantId: input.tenantId,
    action: "paperclip_connection.upserted",
    entityType: "paperclip_connection",
    entityId: input.tenantId,
    payload: { baseUrl },
  });
}

export async function getPaperclipConnection(tenantId: string) {
  const row = await db
    .select()
    .from(paperclipConnections)
    .where(eq(paperclipConnections.tenantId, tenantId))
    .then((r) => r[0]);
  return row ?? null;
}

export async function pingPaperclip(tenantId: string) {
  const row = await getPaperclipConnection(tenantId);
  if (!row) throw new HttpError(404, "not_configured", "Paperclip connection not configured");

  const healthUrl = `${normalizeBaseUrl(row.baseUrl)}/api/health`;
  let res = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 401 || res.status === 403) {
    res = await fetch(healthUrl, {
      headers: { Authorization: `Bearer ${row.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  }

  return {
    ok: res.ok,
    status: res.status,
    url: healthUrl,
  };
}
