import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { hasPaidAccess } from "@/lib/access";
import { newId } from "@/lib/id";
import { payHeroConfigured, payHeroChannelConfigured, initiateStkPush } from "@/lib/payhero";
import {
  ACCESS_TOTAL_MINOR,
  ACCESS_PRICE_MINOR,
  ACCESS_VAT_MINOR,
  CURRENCY,
  normaliseKenyanPhone,
} from "@/lib/pricing";

const MAX_BODY_BYTES = 512;

const bodySchema = z.object({
  phoneNumber: z.string().trim().min(1).max(20),
});

export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Already paid: never take money twice.
  if (await hasPaidAccess(user.id)) {
    return NextResponse.json(
      { error: "This account already has access." },
      { status: 409 },
    );
  }

  const limit = rateLimit(`checkout:ip:${clientIp(req)}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many payment attempts. Please try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
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
      { error: "Enter a phone number to receive the M-Pesa prompt." },
      { status: 400 },
    );
  }

  const phone = normaliseKenyanPhone(parsed.data.phoneNumber);
  if (!phone) {
    return NextResponse.json(
      {
        error:
          "That does not look like a Kenyan mobile number. Use the form 0712 345 678.",
      },
      { status: 400 },
    );
  }

  if (!payHeroConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured on this deployment." },
      { status: 503 },
    );
  }

  const channelId = process.env.PAYHERO_CHANNEL_ID ?? "";
  if (!payHeroChannelConfigured()) {
    // Explicit and distinct from "provider down": an operator needs to know a
    // variable is missing, and a candidate should never see this.
    console.error(
      "[paywall] PAYHERO_CHANNEL_ID is not set; cannot route M-Pesa payments.",
    );
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please contact support." },
      { status: 503 },
    );
  }

  const origin = new URL(req.url).origin;
  const paymentId = newId();
  // The reference is ours and is echoed back on the callback, which is how a
  // webhook is matched to a row without trusting anything in the payload.
  const externalReference = `OA-${paymentId.replace(/-/g, "").slice(0, 20).toUpperCase()}`;

  const [row] = await db
    .insert(payments)
    .values({
      id: paymentId,
      userId: user.id,
      status: "pending",
      amountMinor: ACCESS_PRICE_MINOR,
      vatMinor: ACCESS_VAT_MINOR,
      totalMinor: ACCESS_TOTAL_MINOR,
      currency: CURRENCY,
      externalReference,
      channelId,
      phoneNumber: phone,
    })
    .returning();

  const [profile] = await db
    .select({ fullName: users.fullName, email: users.email })
    .from(users)
    .where(eq(users.id, user.id));

  const result = await initiateStkPush({
    // PayHero takes the gross amount; VAT is our bookkeeping.
    amount: ACCESS_TOTAL_MINOR / 100,
    phoneNumber: phone,
    channelId,
    externalReference,
    callbackUrl: `${origin}/api/webhooks/payhero`,
    name: profile?.fullName,
    email: profile?.email,
  });

  if (!result.ok) {
    console.error(`[paywall] STK push failed for ${externalReference}: ${result.message}`);
    await db
      .update(payments)
      .set({ status: "failed", failureReason: result.message })
      .where(eq(payments.id, paymentId));

    return NextResponse.json(
      {
        error:
          "We could not send the payment prompt. Check the number and try again, or contact support.",
      },
      { status: 502 },
    );
  }

  await db
    .update(payments)
    .set({ providerReference: result.providerReference ?? null, rawPayload: result.raw })
    .where(eq(payments.id, row.id));

  // Deliberately does not grant access: acceptance is not payment.
  return NextResponse.json({
    ok: true,
    paymentId: row.id,
    externalReference,
    status: "pending",
    amountMinor: ACCESS_TOTAL_MINOR,
    message:
      "Check your phone for the M-Pesa prompt and enter your PIN. Access is granted once the payment is confirmed.",
  });
}
