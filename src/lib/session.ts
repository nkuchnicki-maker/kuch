import { SignJWT, jwtVerify } from "jose";

// Edge-safe: no Node-only imports (no `pg`, no `bcryptjs`) so this can be
// imported from proxy.ts, which runs on the edge runtime. DB-backed auth
// helpers live in ./auth instead.

export const SESSION_COOKIE = "session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  isAdmin: boolean;
};

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string" || typeof payload.isAdmin !== "boolean") {
      return null;
    }
    return { sub: payload.sub, isAdmin: payload.isAdmin };
  } catch {
    return null;
  }
}
