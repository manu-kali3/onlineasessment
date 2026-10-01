import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import type { User } from "@/db/schema";

/**
 * Guard for admin route handlers. Returns either the authorised user or a
 * ready-to-return error response, so handlers cannot forget to handle the
 * rejection case.
 */
export async function authorize(...roles: User["role"][]) {
  try {
    const user = await requireUser(...roles);
    return { user, error: null } as const;
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        user: null,
        error:
          err.code === "UNAUTHENTICATED"
            ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      } as const;
    }
    throw err;
  }
}