import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { checkPassword } from "@/lib/password";
import { hashToken, tokensMatch } from "@/lib/tokens";

const MAX_BODY_BYTES = 2_048;

const bodySchema = z.object({
  token: z.string().min(10),
  password: z.string(),
});

/**
 * Consumes a reset token and sets a new password.
 *
 * Bumping sessionVersion invalidates every cookie issued under the old
 * password, so a stolen session cannot outlive the reset.
 */
export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { token, password } = parsed.data;

  const strength = checkPassword(password);
  if (!strength.ok) {
    return NextResponse.json(
      { error: strength.error, feedback: strength.feedback },
      { status: 400 },
    );
  }

  const digest = hashToken(token);

  const [record] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, digest),
        eq(authTokens.purpose, "password_reset"),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  // One message for unknown, expired, and already-used tokens, so the response
  // cannot be used to probe which values were once valid.
  const invalid = {
    error: "This reset link is invalid or has expired. Request a new one.",
  };

  if (!record) return NextResponse.json(invalid, { status: 400 });
  if (!tokensMatch(record.tokenHash, digest)) {
    return NextResponse.json(invalid, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  // Increment rather than set a fixed value: every existing cookie carries the
  // old version, so bumping it is what retires sessions issued under the
  // previous password.
  const [user] = await db
    .select({ sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, record.userId))
    .limit(1);

  if (!user) return NextResponse.json(invalid, { status: 400 });

  await db
    .update(users)
    .set({
      passwordHash,
      sessionVersion: user.sessionVersion + 1,
    })
    .where(eq(users.id, record.userId));

  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(eq(authTokens.id, record.id));

  // Invalidate every other outstanding reset token for this account.
  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, record.userId),
        eq(authTokens.purpose, "password_reset"),
        isNull(authTokens.consumedAt),
      ),
    );

  return NextResponse.json({
    ok: true,
    message: "Your password has been changed. You can sign in now.",
  });
}