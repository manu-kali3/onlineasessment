import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { hasPaidAccess } from "@/lib/access";

/**
 * Lets the checkout poll whether the webhook has granted access yet. Returns
 * only a boolean: it must never leak whether a payment exists for another
 * account, so it is scoped to the session user and says nothing more.
 */
export async function GET() {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { paid: await hasPaidAccess(user.id) },
    { headers: { "cache-control": "no-store" } },
  );
}
