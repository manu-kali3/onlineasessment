import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, auditLogs, proctorEvents } from "@/db/schema";
import { authorize } from "@/lib/api-auth";
import { newId } from "@/lib/id";
import { hasDatabase } from "@/lib/env";

const bodySchema = z.object({
  attemptId: z.string().min(1),
  resolution: z.string().min(3).max(500),
});

/** Assessor adjudication of proctoring signals. Always human-in-the-loop. */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { user, error } = await authorize("recruiter", "assessor", "admin");
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { attemptId, resolution } = parsed.data;

  const events = await db
    .select()
    .from(proctorEvents)
    .where(eq(proctorEvents.attemptId, attemptId));

  for (const event of events) {
    await db
      .update(proctorEvents)
      .set({ reviewed: true, resolution, reviewedBy: user.id })
      .where(eq(proctorEvents.id, event.id));
  }

  await db.insert(auditLogs).values({
    id: newId(),
    actorId: user.id,
    action: "proctor.resolve",
    entityType: "attempt",
    entityId: attemptId,
    metadata: { resolution, eventsReviewed: events.length },
  });

  // A cleared attempt regains full integrity so it stops surfacing in the queue
  if (resolution.startsWith("Reviewed")) {
    await db
      .update(attempts)
      .set({ integrityScore: 100 })
      .where(eq(attempts.id, attemptId));
  }

  return NextResponse.json({ ok: true, reviewed: events.length });
}