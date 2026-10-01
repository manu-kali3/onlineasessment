import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, responses } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { newId } from "@/lib/id";

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
  durationMs: z.number().int().nonnegative().optional(),
});

/** Autosave endpoint called by the runner on blur, navigation, and every 15s. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const [existing] = await db
    .select()
    .from(responses)
    .where(
      and(
        eq(responses.attemptId, attemptId),
        eq(responses.questionId, questionId),
      ),
    );

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