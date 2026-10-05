import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, payments, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { canAccessCourse } from "@/lib/access";
import { newId } from "@/lib/id";
import { payHeroConfigured, payHeroChannelConfigured, initiateStkPush } from "@/lib/payhero";
import { CURRENCY, normaliseKenyanPhone } from "@/lib/pricing";

const MAX_BODY_BYTES = 512;

const bodySchema = z.object({
  phoneNumber: z.string().trim().min(1).max(20),
  // Which course this payment unlocks. Required: there is no global paywall any
  // more, so a payment without a course would unlock nothing.
  assessmentId: z.string().min(1),
});

export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { assessmentId } = parsed.data;

  // Already has access to this course: never take money twice.
  if (await canAccessCourse(user.id, assessmentId)) {
    return NextResponse.json(
      { error: "This account already has access to this course." },
      { status: 409 },
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

  // Price comes from the course row, never from the request. A client cannot
// therefore pay less than the course costs.
  const [course] = await db
    .select({
      priceMinor: assessments.priceMinor,
      vatMinor: assessments.vatMinor,
    })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (course.priceMinor === 0) {
    return NextResponse.json(
      { error: "This course is free — no payment needed." },
      { status: 400 },
    );
  }

  const vatMinor = course.vatMinor ?? 0;
  const totalMinor = course.priceMinor + vatMinor;

  const [row] = await db
    .insert(payments)
    .values({
      id: paymentId,
      userId: user.id,
      assessmentId,
      status: "pending",
      amountMinor: course.priceMinor,
      vatMinor,
      totalMinor,
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
    amount: totalMinor / 100,
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
    amountMinor: totalMinor,
    message:
      "Check your phone for the M-Pesa prompt and enter your PIN. Access is granted once the payment is confirmed.",
  });
}
