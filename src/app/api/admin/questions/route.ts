import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assessmentQuestions, assessments, questions } from "@/db/schema";
import { authorize } from "@/lib/api-auth";
import { hasDatabase } from "@/lib/env";
import { newId } from "@/lib/id";

const bodySchema = z.object({
  assessmentId: z.string().min(1),
  question: z.object({
    type: z.enum([
      "multiple_choice",
      "multi_select",
      "true_false",
      "free_text",
      "coding",
      "video",
    ]),
    prompt: z.string().trim().min(1).max(2000),
    options: z
      .array(z.object({ id: z.string().min(1).max(8), label: z.string().min(1).max(500) }))
      .max(10)
      .default([]),
    correctAnswer: z.union([z.string(), z.boolean()]).nullable(),
    rubric: z
      .array(
        z.object({
          criterion: z.string().min(1).max(300),
          weight: z.number().positive().default(1),
          levels: z.array(z.string().min(1).max(500)).max(4).default([]),
        }),
      )
      .max(10)
      .nullable(),
    competencyId: z.string().nullable(),
    difficulty: z.number().min(0).max(1).nullable(),
    timeLimitSec: z.number().int().positive().max(7200).nullable(),
  }),
});

/**
 * Adds a question to an assessment.
 *
 * The question is written to the bank and linked in one step, so an author never
 * has to create a question and then hunt for it. Position is derived from the
 * current length rather than supplied, which removes the usual off-by-one and
 * duplicate-position bugs.
 */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { user, error } = await authorize("recruiter", "assessor", "admin");
  if (error) return error;

  const raw = await req.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { assessmentId, question } = parsed.data;

  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  // Objective items need an answer key; subjective ones must not carry one, or
  // the scorer would be grading against a key the candidate never saw.
  const isObjective =
    question.type === "multiple_choice" ||
    question.type === "multi_select" ||
    question.type === "true_false";

  if (isObjective && question.correctAnswer === null) {
    return NextResponse.json(
      { error: "This question type needs a correct answer." },
      { status: 400 },
    );
  }
  if (!isObjective && question.correctAnswer !== null) {
    return NextResponse.json(
      { error: "This question type is scored by an assessor, so it has no answer key." },
      { status: 400 },
    );
  }

  const questionId = newId();

  await db.insert(questions).values({
    id: questionId,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    correctAnswer: question.correctAnswer,
    rubric: question.rubric,
    competencyId: question.competencyId,
    difficulty: question.difficulty,
    timeLimitSec: question.timeLimitSec,
    isValidated: true,
    authorId: user.id,
  });

  const [{ count }] = await db
    .select({ count: assessmentQuestions.position })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId));

  await db.insert(assessmentQuestions).values({
    assessmentId,
    questionId,
    position: (count ?? 0) + 1,
    weight: 1,
  });

  return NextResponse.json({ ok: true, questionId }, { status: 201 });
}
