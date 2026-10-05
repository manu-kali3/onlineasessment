import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assessmentInvitations,
  assessments,
  courseAccess,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { canAccessCourse, grantCourseAccess } from "@/lib/access";
import { newToken } from "@/lib/id";

const bodySchema = z.object({
  assessmentId: z.string().min(1),
});

/**
 * Enrols the signed-in candidate in a course.
 *
 * Free courses enrol immediately. Paid courses are refused here and the client
 * is sent to the per-course checkout, because taking money is the payment
 * endpoint's job and must never be triggered by a plain POST.
 *
 * Re-enrolling in a course you already have is a no-op rather than an error, so
 * a double-click or a stale button cannot create duplicate invitations.
 */
export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { assessmentId } = parsed.data;

  const [course] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (course.status !== "published") {
    return NextResponse.json(
      { error: "This course is not open for enrolment." },
      { status: 409 },
    );
  }

  // Already enrolled: report success without writing anything.
  const [existing] = await db
    .select({ id: assessmentInvitations.id })
    .from(assessmentInvitations)
    .where(
      and(
        eq(assessmentInvitations.candidateId, user.id),
        eq(assessmentInvitations.assessmentId, assessmentId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyEnrolled: true,
      invitationId: existing.id,
      checkoutUrl:
        course.priceMinor > 0 && !(await canAccessCourse(user.id, assessmentId))
          ? `/paywall?course=${assessmentId}`
          : null,
    });
  }

  // Paid and not yet unlocked: hand off to checkout.
  if (course.priceMinor > 0 && !(await canAccessCourse(user.id, assessmentId))) {
    return NextResponse.json({
      ok: true,
      requiresPayment: true,
      checkoutUrl: `/paywall?course=${assessmentId}`,
    });
  }

  // Free course, or already unlocked: create the invitation and grant access.
  const invitationId = crypto.randomUUID();
  await db.insert(assessmentInvitations).values({
    id: invitationId,
    assessmentId,
    candidateId: user.id,
    token: newToken(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    status: "invited",
  });

  await grantCourseAccess(user.id, assessmentId, "free");

  return NextResponse.json({
    ok: true,
    enrolled: true,
    invitationId,
    checkoutUrl: null,
  });
}
