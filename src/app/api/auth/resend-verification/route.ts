import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { databaseUnavailable } from "@/lib/api-guard";
import { sendVerificationEmail } from "@/lib/email";
import { resolveAppUrl } from "@/lib/app-url";
import { generateToken, hashToken, TOKEN_TTL_MIN } from "@/lib/tokens";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { newId } from "@/lib/id";

const MAX_BODY_BYTES = 2_048;

/**
 * Minimum gap between emails to the same address. Guards the mail path
 * independently of the IP limit below.
 */
const RESEND_COOLDOWN_SEC = 60;

/** Per-IP budget. */
const IP_LIMIT = 20;
const IP_WINDOW_MS = 10 * 60_000;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Resends a verification link, and reports what it found.
 *
 * NOTE ON ENUMERATION: this discloses whether an address is registered, which
 * is a deliberate product decision. The consequence is that anyone who can
 * reach this endpoint can test whether a given person holds an account here,
 * which is useful for targeted phishing or credential stuffing.
 *
 * The only thing limiting that is `rateLimit`, and it is per-instance: see the
 * warning at the top of src/lib/rate-limit.ts. If enumeration matters, the
 * durable fix is a shared rate-limit store, or dropping the disclosure and
 * returning a generic response again.
 */
export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const ip = clientIp(req);
  const ipLimit = rateLimit(`resend:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);

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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.email;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.email, email));

  if (!user) {
    return NextResponse.json({
      ok: true,
      status: "not_registered",
      message:
        "That address is not registered here. Check the spelling, or create an account.",
    });
  }

  if (user.emailVerified) {
    return NextResponse.json({
      ok: true,
      status: "already_verified",
      message:
        "That address is already confirmed. Sign in with your password, or reset it if you have forgotten it.",
    });
  }

  // Per-address budget, tighter than the per-IP one.
  const addressLimit = rateLimit(
    `resend:addr:${user.id}`,
    3,
    10 * 60_000,
  );

  if (!addressLimit.ok) {
    return NextResponse.json({
      ok: true,
      status: "rate_limited",
      message: "We have already sent several links for this address. Check your inbox and spam folder before asking for another.",
      retryAfterSec: addressLimit.retryAfterSec,
    });
  }

  // Mail-specific cooldown: one message per address per interval.
  const mailLimit = rateLimit(
    `resend:mail:${user.id}`,
    1,
    RESEND_COOLDOWN_SEC * 1000,
  );

  if (!mailLimit.ok) {
    return NextResponse.json({
      ok: true,
      status: "rate_limited",
      message:
        "A verification link was sent moments ago. Give it a minute to arrive before requesting another.",
      retryAfterSec: mailLimit.retryAfterSec,
    });
  }

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
    ok: true,
    status: result.delivered ? "sent" : "sent_unconfirmed",
    message: result.delivered
      ? "Verification link sent. It expires in 60 minutes and can only be used once."
      : "Verification link generated, but we could not hand it to the mail provider. Request it again, or contact your administrator.",
    // Local convenience only, and only when delivery did not happen.
    devVerifyUrl: result.delivered ? undefined : verifyUrl,
  });
}