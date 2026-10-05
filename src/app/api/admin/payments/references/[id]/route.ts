import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentReferences } from "@/db/schema";
import { authorize } from "@/lib/api-auth";
import { hasDatabase } from "@/lib/env";
import { grantCourseAccess } from "@/lib/access";

// The reference id comes from the URL, not the body. Accepting it in both would
// let a caller name one reference in the path and decide a different one in the
// body, which is a confusing way to grant access to the wrong candidate.
const bodySchema = z.object({
  action: z.enum(["verify", "reject"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * Admin decision on a submitted payment reference.
 *
 * Verifying grants course access. This is the only path by which a pasted
 * reference code unlocks anything, which is deliberate: M-Pesa confirmation
 * codes are not secret, so the code alone must never be sufficient.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { user, error } = await authorize("recruiter", "admin");
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { action, note } = parsed.data;
  const { id: referenceId } = await context.params;

  const [row] = await db
    .select()
    .from(paymentReferences)
    .where(eq(paymentReferences.id, referenceId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Reference not found" }, { status: 404 });
  }
  if (row.status !== "pending") {
    return NextResponse.json(
      { error: `This reference has already been ${row.status}.` },
      { status: 409 },
    );
  }

  const status = action === "verify" ? "verified" : "rejected";

  await db
    .update(paymentReferences)
    .set({
      status,
      reviewedBy: user.id,
      reviewNote: note ?? null,
      reviewedAt: new Date(),
    })
    .where(
      and(eq(paymentReferences.id, referenceId), eq(paymentReferences.status, "pending")),
    );

  if (action === "verify") {
    await grantCourseAccess(row.userId, row.assessmentId, "admin", user.id);
  }

  return NextResponse.json({
    ok: true,
    referenceId,
    status,
    accessGranted: action === "verify",
  });
}
