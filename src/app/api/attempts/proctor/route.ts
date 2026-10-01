import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, proctorEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { newId } from "@/lib/id";
import { databaseUnavailable } from "@/lib/api-guard";
import { computeIntegrityScore } from "@/lib/scoring";

const bodySchema = z.object({
  attemptId: z.string().min(1),
  type: z.enum([
    "tab_switch",
    "fullscreen_exit",
    "window_blur",
    "copy_attempt",
    "paste_attempt",
    "face_missing",
    "multiple_faces",
    "gaze_off_screen",
    "audio_noise",
    "fullscreen_enter",
  ]),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Ingest proctoring signals from the browser lockdown layer and the AI
 * monitoring provider. Events are stored as-is; the integrity score is a
 * derived rollup so we can recompute it after a reviewer adds events.
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
  const { attemptId, type, severity, metadata } = parsed.data;

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.candidateId, user.id)));

  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt closed" }, { status: 409 });
  }

  await db.insert(proctorEvents).values({
    id: newId(),
    attemptId,
    type,
    severity,
    metadata: metadata ?? {},
    occurredAt: new Date(),
  });

  const events = await db
    .select({ severity: proctorEvents.severity })
    .from(proctorEvents)
    .where(eq(proctorEvents.attemptId, attemptId));

  const integrity = computeIntegrityScore(
    events.map((e) => e.severity as "info" | "warning" | "critical"),
  );

  await db.update(attempts).set({ integrityScore: integrity }).where(eq(attempts.id, attemptId));

  return NextResponse.json({ ok: true, integrityScore: integrity });
}