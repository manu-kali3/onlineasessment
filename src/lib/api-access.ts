import { NextResponse } from "next/server";
import { canAccessCourse } from "@/lib/access";

/**
 * Per-course payment gate for the attempt APIs.
 *
 * The test runner page also checks this, but a page check alone is not enough:
 * the APIs are reachable directly, so an unpaid candidate with an invitation to
 * a paid course — from an admin invite, a seed, or a course that was free and
 * has since been repriced — could otherwise start and submit it.
 *
 * Returns a 402 response to return early, or null when access is fine.
 */
export async function coursePaymentDenied(
  userId: string,
  assessmentId: string,
): Promise<NextResponse | null> {
  if (await canAccessCourse(userId, assessmentId)) return null;

  return NextResponse.json(
    {
      error: "Payment required",
      code: "PAYMENT_REQUIRED",
      checkoutUrl: `/paywall?course=${assessmentId}`,
    },
    { status: 402 },
  );
}