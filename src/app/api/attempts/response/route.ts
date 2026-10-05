import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  assessmentQuestions,
  attempts,
  responses,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { newId } from "@/lib/id";
import { databaseUnavailable } from "@/lib/api-guard";


const bodySchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.union([
    z.string(),
    z.array(z.string()),
    z.boolean(),
    z.object({ code: z.string(), language: z.string() }),
    z.null(),
  ]),
  durationMs: z.number().int().nonnegative().max(3_600_000).optional(),
});

/** Autosave endpoint called by the runner on navigation and every 15s. */
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
  const { attemptId, questionId, answer, durationMs } = parsed.data;

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(
      and(eq(attempts.id, attemptId), eq(attempts.candidateId, user.id)),
    );

  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt closed" }, { status: 409 });
  }

  // Confirm the question actually belongs to this attempt's assessment. Without
  // this a candidate could submit answers for arbitrary questions in the bank.
  const [allowed] = await db
    .select({ questionId: assessmentQuestions.questionId })
    .from(assessmentQuestions)
    .where(
      and(
        eq(assessmentQuestions.assessmentId, attempt.assessmentId),
        eq(assessmentQuestions.questionId, questionId),
      ),
    )
    .limit(1);

  if (!allowed) {
    return NextResponse.json(
      { error: "Question is not part of this assessment" },
      { status: 400 },
    );
  }

  const existingRows = await db
    .select()
    .from(responses)
    .where(
      and(
        eq(responses.attemptId, attemptId),
        inArray(responses.questionId, [questionId]),
      ),
    );
  const existing = existingRows[0];

  if (existing) {
    // Accumulate time-on-task and count edits rather than overwriting
    await db
      .update(responses)
      .set({
        answer,
        durationMs: (existing.durationMs ?? 0) + (durationMs ?? 0),
        attemptsCount: existing.attemptsCount + 1,
      })
      .where(eq(responses.id, existing.id));
  } else {
    await db.insert(responses).values({
      id: newId(),
      attemptId,
      questionId,
      answer,
      durationMs: durationMs ?? 0,
      attemptsCount: 1,
    });
  }

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}