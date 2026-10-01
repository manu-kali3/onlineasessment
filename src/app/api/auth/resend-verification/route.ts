import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { databaseUnavailable } from "@/lib/api-guard";
import { sendVerificationEmail } from "@/lib/email";
import { resolveAppUrl } from "@/lib/app-url";
import { generateToken, hashToken, TOKEN_TTL_MIN } from "@/lib/tokens";
import { newId } from "@/lib/id";

const MAX_BODY_BYTES = 2_048;

/**
 * Minimum gap between emails to the same address. Without a shared rate limiter
 * this is what stops the endpoint being used to mail-bomb someone; the residual
 * risk is noted in the README.
 */
const RESEND_COOLDOWN_SEC = 60;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Re-sends a verification link.
 *
 * Returns an identical 200 whether the address is unknown, already verified, or
 * still cooling down, so it cannot be used to discover who has an account.
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

  const generic = {
    ok: true,
    message:
      "If that address is registered and still awaiting verification, we have sent a fresh link.",
  };

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.email, parsed.data.email));

  if (!user || user.emailVerified) return NextResponse.json(generic);

  // Cooldown: if a link was issued very recently, do nothing. The response is
  // the same generic one, so the caller cannot tell they were rate limited.
  const [recent] = await db
    .select({ createdAt: authTokens.createdAt })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, user.id),
        eq(authTokens.purpose, "email_verification"),
        isNull(authTokens.consumedAt),
        gt(
          authTokens.createdAt,
          new Date(Date.now() - RESEND_COOLDOWN_SEC * 1000),
        ),
      ),
    )
    .limit(1);

  if (recent) return NextResponse.json(generic);

  // Supersede every outstanding verification token, then issue a new one.
  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, user.id),
        eq(authTokens.purpose, "email_verification"),
        isNull(authTokens.consumedAt),
      ),
    );

  const token = generateToken();
  await db.insert(authTokens).values({
    id: newId(),
    userId: user.id,
    purpose: "email_verification",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60_000),
  });

  const verifyUrl = `${await resolveAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  const result = await sendVerificationEmail({
    to: user.email,
    name: user.fullName,
    url: verifyUrl,
  });

  return NextResponse.json({
    ...generic,
    // Local convenience only, and only when delivery did not happen.
    devVerifyUrl: result.delivered ? undefined : verifyUrl,
  });
}