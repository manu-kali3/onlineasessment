import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Single-use auth tokens.
 *
 * The plaintext token only ever exists in the emailed URL. The database stores
 * a SHA-256 digest, so database access alone cannot be used to take over an
 * account — the digest cannot be reversed into the original value.
 */
export const TOKEN_TTL_MIN = 60;

/** URL-safe random token with 256 bits of entropy. */
export function generateToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash with SHA-256 rather than bcrypt: the input is already 256 bits of
 * entropy, so there is nothing to brute-force and a slow KDF would only add
 * latency to every verification.
 */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time digest comparison. */
export function tokensMatch(a: string, b: string) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}