import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";
import type { User } from "@/db/schema";

/**
 * Auth guard for pages.
 *
 * Order matters: when the database is missing we bounce to the home page (which
 * renders the setup notice) rather than to /login, which would just bounce back
 * here and produce a redirect loop.
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