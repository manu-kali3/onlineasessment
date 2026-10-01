import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { env, hasDatabase } from "./env";

const SESSION_COOKIE = "oa_session";
const SESSION_TTL_SEC = 60 * 60 * 8; // 8h — covers one sitting of a timed test

const key = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionPayload = {
  sub: string;
  role: User["role"];
  email: string;
  /** Bumped on password change; a stale value invalidates the cookie. */
  sv: number;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: {
  id: string;
  role: User["role"];
  email: string;
  sessionVersion: number;
}) {
  const token = await new SignJWT({
    sub: user.id,
    role: user.role,
    email: user.email,
    sv: user.sessionVersion,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(key);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") {
      // A cookie signed before session versioning existed, or a malformed one.
      return null;
    }
    return {
      sub: payload.sub,
      role: payload.role as User["role"],
      email: payload.email as string,
      sv: payload.sv,
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  // No cookie means no user regardless of database state, so this short-circuits
  // before any query — important when DATABASE_URL is absent.
  const session = await readSession();
  if (!session) return null;
  if (!hasDatabase) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.sub));
  if (!user) return null;

  // A password change bumps sessionVersion, which retires every cookie issued
  // before it. Comparing here is what makes a reset genuinely revoke access.
  if (user.sessionVersion !== session.sv) return null;

  return user;
}

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
  ) {
    super(code);
    this.name = "AuthError";
  }
}

export async function requireUser(...roles: User["role"][]) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  if (roles.length && !roles.includes(user.role)) throw new AuthError("FORBIDDEN");
  return user;
}