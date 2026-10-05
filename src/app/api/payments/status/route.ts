import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import { canAccessCourse } from "@/lib/access";

/**
 * Lets the checkout poll whether the webhook has granted access yet.
 *
 * Scoped to the session user and to one course, and returns only a boolean. It
 * must not reveal whether a payment exists for another account, nor whether any
 * other course is unlocked.
 */
export async function GET(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const course = new URL(req.url).searchParams.get("course");
  if (!course) {
    return NextResponse.json(
      { error: "A course id is required." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { paid: await canAccessCourse(user.id, course) },
    { headers: { "cache-control": "no-store" } },
  );
}
