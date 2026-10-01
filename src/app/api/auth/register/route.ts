import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { checkPassword } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { generateToken, hashToken, TOKEN_TTL_MIN } from "@/lib/tokens";
import { newId } from "@/lib/id";

const MAX_BODY_BYTES = 8_192;

const bodySchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string(),
});

/**
 * Identical for a new account and an existing one. Any difference here would
 * turn this endpoint into a way to confirm which addresses are registered.
 */
const ACCEPTED = {
  ok: true,
  requiresVerification: true,
  message:
    "If that address can be registered, we have sent a verification link to it. The link expires in 60 minutes.",
};

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
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  // Self-registration creates candidates only. Staff accounts are provisioned by
  // an admin so that nobody can grant themselves recruiter access by signing up.
  if (existing) {
    // Same response as a fresh signup. A real duplicate should also re-send the
    // verification email, but that would turn this into a mail-relay; the user
    // can use the reset flow instead.
    return NextResponse.json(ACCEPTED);
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

  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;

  const result = await sendVerificationEmail({
    to: email,
    name: fullName,
    url: verifyUrl,
  });

  return NextResponse.json({
    ...ACCEPTED,
    // Surfaced only when email could not be sent, so a developer running locally
    // can still complete the flow.
    devVerifyUrl: result.delivered ? undefined : verifyUrl,
  });
}