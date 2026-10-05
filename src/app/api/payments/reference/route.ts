import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, paymentReferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { canAccessCourse } from "@/lib/access";

const MAX_BODY_BYTES = 1_024;

const bodySchema = z.object({
  assessmentId: z.string().min(1),
  referenceCode: z.string().trim().min(4).max(64),
  channel: z.string().trim().max(60).optional(),
  amountMinor: z.number().int().min(0).max(10_000_000).optional(),
});

/**
 * Submits a payment reference for a course the candidate says they have already
 * paid for outside the portal.
 *
 * This never grants access. The row is written as `pending` and an admin must
 * verify it, because an M-Pesa confirmation code is not secret — anyone who has
 * ever paid you has seen one, and the format is well known.
 */
export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      { error: "Enter the reference code from your payment confirmation." },
      { status: 400 },
    );
  }

  const { assessmentId, referenceCode, channel, amountMinor } = parsed.data;

  const [course] = await db
    .select({ id: assessments.id, priceMinor: assessments.priceMinor })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // Already unlocked: nothing to verify.
  if (await canAccessCourse(user.id, assessmentId)) {
    return NextResponse.json({
      ok: true,
      alreadyHasAccess: true,
      message: "You already have access to this course.",
    });
  }

  // A free course needs no payment at all.
  if (course.priceMinor === 0) {
    return NextResponse.json(
      { error: "This course is free — no payment is needed." },
      { status: 400 },
    );
  }

  // One open request per course per user. A second submission while the first is
  // pending would let a candidate spam the admin queue.
  const [open] = await db
    .select({ id: paymentReferences.id })
    .from(paymentReferences)
    .where(
      and(
        eq(paymentReferences.userId, user.id),
        eq(paymentReferences.assessmentId, assessmentId),
        eq(paymentReferences.status, "pending"),
      ),
    )
    .limit(1);

  if (open) {
    return NextResponse.json({
      ok: true,
      alreadySubmitted: true,
      message:
        "You already have a reference under review. An admin will verify it shortly.",
    });
  }

  await db.insert(paymentReferences).values({
    id: crypto.randomUUID(),
    userId: user.id,
    assessmentId,
    referenceCode,
    channel: channel ?? null,
    amountMinor: amountMinor ?? null,
  });

  return NextResponse.json({
    ok: true,
    status: "pending",
    message:
      "Reference received. An admin will verify it and your access will be granted once confirmed.",
  });
}
