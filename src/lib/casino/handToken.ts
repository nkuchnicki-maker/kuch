import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function deriveKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(secret).digest(); // 32 bytes -> AES-256 key
}

// Encrypts mid-hand blackjack state (both hands so far, wager, the
// forcedLoss flag) into an opaque token the client round-trips between
// deal/hit/stand calls. This MUST be encrypted, not just signed — a
// signed-but-readable (e.g. plain base64) token would let anyone decode it
// in devtools and read the forcedLoss flag or the dealer's hidden card
// straight off the wire, which breaks both the game and the point of it.
export function encryptHandState<T>(data: T): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptHandState<T>(token: string): T | null {
  try {
    const key = deriveKey();
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null; // tampered, wrong key, or malformed — never trust a token that doesn't decrypt clean
  }
}
