import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, assessmentInvitations, attempts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { newId } from "@/lib/id";
import { databaseUnavailable } from "@/lib/api-guard";


const bodySchema = z.object({
  invitationId: z.string().min(1),
});

/**
 * Starts an attempt and stamps startedAt, which locks the countdown
 * server-side (the client timer is only a mirror).
 */
export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { invitationId } = parsed.data;

  const [invitation] = await db
    .select()
    .from(assessmentInvitations)
    .where(
      and(
        eq(assessmentInvitations.id, invitationId),
        eq(assessmentInvitations.candidateId, user.id),
      ),
    );

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  }

  // Reuse an existing in-progress attempt so a refresh mid-test doesn't lose work
  const [existing] = await db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.invitationId, invitationId),
        eq(attempts.candidateId, user.id),
      ),
    );

  if (existing && existing.status === "submitted") {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }
  if (existing && existing.startedAt) {
    return NextResponse.json({ ok: true, attemptId: existing.id });
  }

  const attemptId = existing?.id ?? newId();
  if (existing) {
    await db
      .update(attempts)
      .set({
        startedAt: new Date(),
        status: "in_progress",
      })
      .where(eq(attempts.id, attemptId));
  } else {
    await db.insert(attempts).values({
      id: attemptId,
      invitationId,
      assessmentId: invitation.assessmentId,
      candidateId: user.id,
      status: "in_progress",
      startedAt: new Date(),
    });
  }

  await db
    .update(assessmentInvitations)
    .set({ status: "in_progress" })
    .where(eq(assessmentInvitations.id, invitationId));

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, invitation.assessmentId));
  if (!assessment) {
    return NextResponse.json(
      { error: "Assessment not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    attemptId,
    durationMin: assessment.durationMin,
  });
}