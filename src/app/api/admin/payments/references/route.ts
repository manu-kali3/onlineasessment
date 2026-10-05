import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, paymentReferences, users } from "@/db/schema";
import { authorize } from "@/lib/api-auth";
import { hasDatabase } from "@/lib/env";

/**
 * Lists payment references awaiting review, newest first.
 *
 * Includes the candidate's name and email so an admin can match the submission
 * against a real M-Pesa or bank notification before granting anything.
 */
export async function GET() {
  if (!hasDatabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { user, error } = await authorize("recruiter", "admin");
  if (error) return error;

  const rows = await db
    .select({
      id: paymentReferences.id,
      referenceCode: paymentReferences.referenceCode,
      channel: paymentReferences.channel,
      amountMinor: paymentReferences.amountMinor,
      status: paymentReferences.status,
      createdAt: paymentReferences.createdAt,
      reviewNote: paymentReferences.reviewNote,
      reviewedAt: paymentReferences.reviewedAt,
      assessmentId: paymentReferences.assessmentId,
      assessmentTitle: assessments.title,
      candidateName: users.fullName,
      candidateEmail: users.email,
    })
    .from(paymentReferences)
    .innerJoin(assessments, eq(assessments.id, paymentReferences.assessmentId))
    .innerJoin(users, eq(users.id, paymentReferences.userId))
    .orderBy(desc(paymentReferences.createdAt));

  return NextResponse.json({
    references: rows,
    pending: rows.filter((r) => r.status === "pending").length,
  });
}
