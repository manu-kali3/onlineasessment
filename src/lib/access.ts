import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { assessments, courseAccess, payments, users } from "@/db/schema";

/**
 * Per-course access.
 *
 * A candidate can start a course when any of these holds: the course is free, a
 * completed payment exists for it, or an admin granted it. This replaced the
 * earlier global sign-in paywall, which charged everyone once and unlocked
 * everything — the requirement now is to charge per course, with some free.
 */
export async function canAccessCourse(
  userId: string,
  assessmentId: string,
): Promise<boolean> {
  const [assessment] = await db
    .select({ priceMinor: assessments.priceMinor })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) return false;
  if (assessment.priceMinor === 0) return true;

  const [access] = await db
    .select({ id: courseAccess.id })
    .from(courseAccess)
    .where(
      and(
        eq(courseAccess.userId, userId),
        eq(courseAccess.assessmentId, assessmentId),
        isNull(courseAccess.expiresAt),
      ),
    )
    .limit(1);

  return Boolean(access);
}

/** Records that a candidate may start a course, and why. */
export async function grantCourseAccess(
  userId: string,
  assessmentId: string,
  source: "free" | "payment" | "admin",
  grantedBy?: string,
) {
  await db
    .insert(courseAccess)
    .values({ id: crypto.randomUUID(), userId, assessmentId, source, grantedBy })
    .onConflictDoNothing();
}

/** Revokes a grant. A payment is not refunded by this; that is a separate flow. */
export async function revokeCourseAccess(userId: string, assessmentId: string) {
  await db
    .delete(courseAccess)
    .where(
      and(
        eq(courseAccess.userId, userId),
        eq(courseAccess.assessmentId, assessmentId),
      ),
    );
}

/**
 * Records a completed payment and unlocks the course it paid for in the same
 * transaction. Guarding on `status !== 'completed'` makes this idempotent:
 * PayHero retries callbacks until it sees a 2xx, so the same notification can
 * arrive more than once.
 */
export async function grantAccessForPayment(
  paymentId: string,
): Promise<boolean> {
  const updated = await db
    .update(payments)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.status, "pending"),
      ),
    )
    .returning({
      userId: payments.userId,
      assessmentId: payments.assessmentId,
      externalReference: payments.externalReference,
    });

  const row = (updated as {
    userId: string;
    assessmentId: string | null;
    externalReference: string;
  }[])[0];
  if (!row) return false;

  if (row.assessmentId) {
    await grantCourseAccess(row.userId, row.assessmentId, "payment");
  } else {
    // Legacy site-wide payment: unlock every published course.
    const courses = await db
      .select({ id: assessments.id })
      .from(assessments)
      .where(eq(assessments.status, "published"));
    for (const c of courses) {
      await grantCourseAccess(row.userId, c.id, "payment");
    }
  }

  return true;
}

/** Latest payment for a user, for the paywall page to display. */
export async function latestPaymentFor(userId: string) {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy((t) => [t.createdAt]);
  const list = (rows as typeof payments.$inferSelect[]) ?? [];
  return list[list.length - 1] ?? null;
}

/** Whether a user still has site-wide access from a legacy payment. */
export async function hasSiteWideAccess(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ accessGrantedAt: users.accessGrantedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(user?.accessGrantedAt);
}