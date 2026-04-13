import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function generateOpaqueToken(): string {
  return `ac_${randomBytes(32).toString("base64url")}`;
}
