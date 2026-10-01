import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { checkPassword } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";
import { resolveAppUrl } from "@/lib/app-url";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { generateToken, hashToken, TOKEN_TTL_MIN } from "@/lib/tokens";
import { newId } from "@/lib/id";

const MAX_BODY_BYTES = 8_192;

const bodySchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string(),
});

/**
 * Registration reports whether the address was already taken.
 *
 * This is a deliberate enumeration trade-off: it gives a candidate a clear "you
 * already have an account, sign in instead" instead of a dead end. The
 * consequence is that anyone who can reach this endpoint can test whether an
 * address is registered here, which is useful for targeted phishing. See the
 * warning at the top of src/lib/rate-limit.ts — `rateLimit` is per-instance, so
 * it is a speed bump rather than a real boundary.
 */
export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const ipLimit = rateLimit(`register:ip:${clientIp(req)}`, 10, 10 * 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      {
        error: "Too many requests. Please try again shortly.",
        retryAfterSec: ipLimit.retryAfterSec,
      },
      {
        status: 429,
        headers: { "retry-after": String(ipLimit.retryAfterSec) },
      },
    );
  }

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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { fullName, email, password } = parsed.data;

  const strength = checkPassword(password);
  if (!strength.ok) {
    return NextResponse.json(
      { error: strength.error, feedback: strength.feedback },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email));

  // Self-registration creates candidates only. Staff accounts are provisioned by
  // an admin so that nobody can grant themselves recruiter access by signing up.
  if (existing) {
    // Say what is actually true. Keeping this generic while /resend-verification
    // discloses would be pointless — an attacker would simply call that one.
    return NextResponse.json({
      ok: true,
      status: existing.emailVerified ? "already_registered" : "awaiting_verification",
      requiresVerification: !existing.emailVerified,
      message: existing.emailVerified
        ? "That address already has a confirmed account. Sign in instead, or reset your password if you have forgotten it."
        : "That address is registered but not confirmed yet. We have not sent another link here — use “Resend verification link” on the sign-in page.",
    });
  }

  const userId = newId();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    fullName,
    role: "candidate",
    emailVerified: false,
  });

  // Issue a fresh token, superseding any earlier unconsumed one for this user.
  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, "email_verification"),
        isNull(authTokens.consumedAt),
      ),
    );

  const token = generateToken();
  await db.insert(authTokens).values({
    id: newId(),
    userId,
    purpose: "email_verification",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60_000),
  });

  // Must point at the API route, not /verify-email. That page only renders the
// outcome from a `status` query param; the token is consumed by the handler
// below, which then redirects here with status=success.
const verifyUrl = `${await resolveAppUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const result = await sendVerificationEmail({
    to: email,
    name: fullName,
    url: verifyUrl,
  });

  return NextResponse.json({
    ok: true,
    status: result.delivered ? "registered" : "registered_unconfirmed",
    requiresVerification: true,
    message:
      "Account created. Check your inbox for a verification link before signing in. The link expires in 60 minutes and can only be used once.",
    // Surfaced only when email could not be sent, so a developer running locally
    // can still complete the flow.
    devVerifyUrl: result.delivered ? undefined : verifyUrl,
  });
}