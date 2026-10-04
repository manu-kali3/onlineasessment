import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { hasPaidAccess } from "./access";
import { paywallRequired } from "./page-auth";

/**
 * Payment guard for API routes.
 *
 * Page gating is not sufficient on its own: the assessment endpoints are
 * callable directly, so an unpaid user could still start an attempt and submit
 * answers without ever paying. Every route that touches assessment content must
 * call this.
 *
 * Returns a response rather than throwing, so a handler can `return denied`
 * without handling an exception.
 */
export async function paymentDenied(): Promise<NextResponse | null> {
  if (!paywallRequired()) return null;

  const user = await getCurrentUser();
  // Not signed in is an auth problem, not a payment one — let the caller's own
  // guard report that with the right status.
  if (!user) return null;

  if (await hasPaidAccess(user.id)) return null;

  return NextResponse.json(
    {
      error: "Payment required.",
      code: "PAYMENT_REQUIRED",
      checkoutUrl: "/paywall",
    },
    { status: 402 },
  );
}
