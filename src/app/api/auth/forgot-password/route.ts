import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { databaseUnavailable } from "@/lib/api-guard";
import { sendPasswordResetEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { generateToken, hashToken, TOKEN_TTL_MIN } from "@/lib/tokens";
import { newId } from "@/lib/id";

const MAX_BODY_BYTES = 2_048;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Always returns the same 200, whether or not the address exists. Anything else
 * turns this endpoint into a way to enumerate which candidates have accounts.
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
      "If that address has an account, a password reset link is on its way. The link expires in 60 minutes.",
  };

  const [user] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.email, parsed.data.email));

  if (!user) return NextResponse.json(generic);

  // Supersede any previous unconsumed reset so only the newest link works.
  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, user.id),
        eq(authTokens.purpose, "password_reset"),
        isNull(authTokens.consumedAt),
      ),
    );

  const token = generateToken();
  await db.insert(authTokens).values({
    id: newId(),
    userId: user.id,
    purpose: "password_reset",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60_000),
  });

  const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const result = await sendPasswordResetEmail({
    to: user.email,
    name: user.fullName,
    url: resetUrl,
  });

  return NextResponse.json({
    ...generic,
    // Local convenience only; see the note in the register route.
    devResetUrl: result.delivered ? undefined : resetUrl,
  });
}