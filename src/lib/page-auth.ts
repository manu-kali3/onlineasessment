import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";
import type { User } from "@/db/schema";

/**
 * Paths reachable before payment. Everything else sits behind the paywall.
 * An explicit list means a new page is gated by default rather than open.
 */
export const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/paywall",
  "/paywall/success",
]);

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Auth guard for pages.
 *
 * There is no global payment gate any more. Access is decided per course, so a
 * candidate can start a free course immediately and is only asked to pay for a
 * paid one — see canAccessCourse in src/lib/access.ts. That check runs on the
 * server, so it cannot be defeated by hiding an overlay or disabling
 * JavaScript.
 *
 * Ordering matters: with no database we go to the home page (which shows the
 * setup notice) rather than /login, which would bounce back and loop.
 */
export async function requirePageUser(
  ...roles: User["role"][]
): Promise<User> {
  if (!hasDatabase) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (roles.length && !roles.includes(user.role)) {
    redirect(user.role === "candidate" ? "/candidate" : "/admin");
  }

  return user;
}