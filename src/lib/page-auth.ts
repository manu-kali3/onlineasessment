import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";
import { hasPaidAccess } from "@/lib/access";
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
 * Auth and payment guard for pages.
 *
 * The payment check runs on the server, so the gate cannot be defeated by
 * hiding the overlay or disabling JavaScript: a locked page is never rendered
 * at all. Ordering matters — with no database we go to the home page (which
 * shows the setup notice) rather than /login, which would bounce back and loop.
 *
 * BYPASS_PAYWALL=1 lets you work locally without paying. It is ignored in
 * production, so it cannot become an accidental way to sell nothing.
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

  if (paywallRequired() && !(await hasPaidAccess(user.id))) {
    redirect("/paywall");
  }

  return user;
}

export function paywallRequired() {
  if (process.env.BYPASS_PAYWALL === "1") {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[paywall] BYPASS_PAYWALL is set in production and is being ignored.",
      );
      return true;
    }
    return false;
  }
  return true;
}