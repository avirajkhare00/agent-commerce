import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { db } from "../db/client.js";
import { agentWallets } from "../db/schema.js";
import { HttpError } from "../lib/errors.js";
import { writeAudit } from "./audit.js";

export async function upsertWallet(input: {
  tenantId: string;
  paperclipCompanyId: string;
  paperclipAgentId: string;
  pubkey: string;
}) {
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(input.pubkey);
  } catch {
    throw new HttpError(400, "invalid_pubkey", "pubkey must be base58");
  }
  if (decoded.length !== 32) throw new HttpError(400, "invalid_pubkey", "Expected 32-byte ed25519 pubkey");

  const [row] = await db
    .insert(agentWallets)
    .values({
      tenantId: input.tenantId,
      paperclipCompanyId: input.paperclipCompanyId,
      paperclipAgentId: input.paperclipAgentId,
      pubkey: input.pubkey,
    })
    .onConflictDoUpdate({
      target: [agentWallets.tenantId, agentWallets.paperclipCompanyId, agentWallets.paperclipAgentId],
      set: {
        pubkey: input.pubkey,
        verifiedAt: null,
        verificationNonce: null,
        verificationNonceExpiresAt: null,
      },
    })
    .returning();

  if (!row) throw new HttpError(500, "wallet_upsert_failed", "Failed to upsert wallet");

  await writeAudit({
    tenantId: input.tenantId,
    action: "agent_wallet.upserted",
    entityType: "agent_wallet",
    entityId: row.id,
    payload: { paperclipAgentId: input.paperclipAgentId },
  });

  return row;
}

export async function listWallets(tenantId: string, paperclipCompanyId?: string) {
  if (paperclipCompanyId) {
    return db
      .select()
      .from(agentWallets)
      .where(and(eq(agentWallets.tenantId, tenantId), eq(agentWallets.paperclipCompanyId, paperclipCompanyId)));
  }
  return db.select().from(agentWallets).where(eq(agentWallets.tenantId, tenantId));
}

export async function issueChallenge(tenantId: string, walletId: string) {
  const row = await db
    .select()
    .from(agentWallets)
    .where(and(eq(agentWallets.id, walletId), eq(agentWallets.tenantId, tenantId)))
    .then((r) => r[0]);
  if (!row) throw new HttpError(404, "not_found", "Wallet not found");

  const nonce = `agent-commerce:${row.id}:${randomBytes(16).toString("hex")}`;
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  await db
    .update(agentWallets)
    .set({ verificationNonce: nonce, verificationNonceExpiresAt: expires })
    .where(eq(agentWallets.id, walletId));

  return { walletId, message: nonce, expiresAt: expires.toISOString() };
}

export async function verifyWallet(input: {
  tenantId: string;
  walletId: string;
  signatureBase64: string;
}) {
  const row = await db
    .select()
    .from(agentWallets)
    .where(and(eq(agentWallets.id, input.walletId), eq(agentWallets.tenantId, input.tenantId)))
    .then((r) => r[0]);
  if (!row) throw new HttpError(404, "not_found", "Wallet not found");
  if (!row.verificationNonce || !row.verificationNonceExpiresAt) {
    throw new HttpError(400, "no_challenge", "Request a challenge first");
  }
  if (row.verificationNonceExpiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "challenge_expired", "Challenge expired; request a new one");
  }

  let sig: Uint8Array;
  try {
    sig = Buffer.from(input.signatureBase64, "base64");
  } catch {
    throw new HttpError(400, "invalid_signature", "signatureBase64 must be valid base64");
  }
  if (sig.length !== 64) throw new HttpError(400, "invalid_signature", "Expected 64-byte ed25519 signature");

  const pub = bs58.decode(row.pubkey);
  const msg = new TextEncoder().encode(row.verificationNonce);
  const ok = nacl.sign.detached.verify(msg, sig, pub);
  if (!ok) throw new HttpError(400, "verification_failed", "Signature did not verify");

  const [updated] = await db
    .update(agentWallets)
    .set({
      verifiedAt: new Date(),
      verificationNonce: null,
      verificationNonceExpiresAt: null,
    })
    .where(eq(agentWallets.id, row.id))
    .returning();

  await writeAudit({
    tenantId: input.tenantId,
    action: "agent_wallet.verified",
    entityType: "agent_wallet",
    entityId: row.id,
    payload: {},
  });

  return updated!;
}
