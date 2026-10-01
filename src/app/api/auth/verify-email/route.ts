import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { databaseUnavailable } from "@/lib/api-guard";
import { hashToken, tokensMatch } from "@/lib/tokens";

/**
 * Consumes an email-verification token.
 *
 * Safe as a GET because the token is single-use, short-lived, and worthless
 * without the emailed link; visiting it twice is harmless. Redirects to a page
 * that reports the outcome rather than rendering JSON in the browser.
 */
export async function GET(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const token = new URL(req.url).searchParams.get("token");
  const base = new URL(req.url).origin;

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${base}/verify-email?status=${encodeURIComponent(reason)}`,
    );

  if (!token || token.length < 10) return fail("invalid");

  const digest = hashToken(token);

  const [record] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, digest),
        eq(authTokens.purpose, "email_verification"),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record || !tokensMatch(record.tokenHash, digest)) {
    return fail("invalid");
  }

  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, record.userId));

  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(eq(authTokens.id, record.id));

  // Retire any other outstanding verification tokens for this account.
  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, record.userId),
        eq(authTokens.purpose, "email_verification"),
        isNull(authTokens.consumedAt),
      ),
    );

  return NextResponse.redirect(`${base}/verify-email?status=success`);
}