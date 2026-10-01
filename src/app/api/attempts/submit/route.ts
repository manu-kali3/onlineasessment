import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  assessmentInvitations,
  assessments,
  assessmentQuestions,
  attempts,
  competencies,
  questions,
  responses,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { databaseUnavailable } from "@/lib/api-guard";
import {
  computeCompetencyScores,
  computeOverallScore,
  computePercentile,
  gradeObjective,
  pendingReviewCount,
} from "@/lib/scoring";

const bodySchema = z.object({
  attemptId: z.string().min(1),
});

/**
 * Submits an attempt, auto-grades objective items, and computes the normed
 * percentile against every other graded attempt on the same assessment.
 * Subjective items are left for human assessors.
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

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(
      and(eq(attempts.id, parsed.data.attemptId), eq(attempts.candidateId, user.id)),
    );

  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (attempt.status === "submitted" || attempt.status === "graded") {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, attempt.assessmentId));
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const links = await db
    .select({
      question: questions,
      position: assessmentQuestions.position,
      weight: assessmentQuestions.weight,
    })
    .from(assessmentQuestions)
    .innerJoin(questions, eq(questions.id, assessmentQuestions.questionId))
    .where(eq(assessmentQuestions.assessmentId, attempt.assessmentId))
    .orderBy(assessmentQuestions.position);

  const existing = await db
    .select()
    .from(responses)
    .where(eq(responses.attemptId, attempt.id));

  const answerByQuestion = new Map(existing.map((r) => [r.questionId, r]));

  let pendingHumanReview = false;

  for (const link of links) {
    const stored = answerByQuestion.get(link.question.id);
    const graded = gradeObjective(link.question, stored?.answer ?? null);

    if (graded.needsHumanReview) {
      pendingHumanReview = true;
      if (!stored) {
        await db.insert(responses).values({
          id: crypto.randomUUID(),
          attemptId: attempt.id,
          questionId: link.question.id,
          answer: null,
          durationMs: 0,
        });
      }
      continue;
    }

    const values = {
      isCorrect: graded.isCorrect,
      awardedScore: graded.awardedScore,
    };

    if (stored) {
      await db
        .update(responses)
        .set(values)
        .where(eq(responses.id, stored.id));
    } else {
      await db.insert(responses).values({
        id: crypto.randomUUID(),
        attemptId: attempt.id,
        questionId: link.question.id,
        answer: null,
        durationMs: 0,
        ...values,
      });
    }
  }

  // Re-read so the aggregate reflects just-written auto grades
  const finalResponses = await db
    .select()
    .from(responses)
    .where(eq(responses.attemptId, attempt.id));

  const questionById = new Map(links.map((l) => [l.question.id, l.question]));
  const weightById = new Map(links.map((l) => [l.question.id, l.weight]));

  const overall = computeOverallScore(
    finalResponses.map((r) => ({
      awardedScore: r.awardedScore,
      weight: weightById.get(r.questionId) ?? 1,
    })),
  );

  // How many items the aggregate above does *not* yet cover.
  const stillPending = pendingReviewCount(
    finalResponses.map((r) => ({ awardedScore: r.awardedScore })),
  );

  const allCompetencies = await db.select({ id: competencies.id }).from(competencies);
  const compScores = computeCompetencyScores(
    finalResponses.map((r) => ({
      competencyId: questionById.get(r.questionId)?.competencyId ?? null,
      awardedScore: r.awardedScore,
      weight: weightById.get(r.questionId) ?? 1,
    })),
    allCompetencies,
  );

  // Norming pool: other attempts on this assessment that already have a score
  const peerScores = (
    await db
      .select({ score: attempts.score })
      .from(attempts)
      .where(
        and(
          eq(attempts.assessmentId, attempt.assessmentId),
          isNotNull(attempts.score),
        ),
      )
  ).map((r) => r.score as number);

  const percentile = computePercentile(overall, [...peerScores, overall]);

  // A pass/fail verdict on a partial score would be misleading: unreviewed items
  // are excluded from the average, so the number can still move. Leave the
  // decision open until every item has been graded.
  const passed =
    stillPending > 0 || assessment.passMark === null
      ? null
      : overall >= assessment.passMark;

  await db
    .update(attempts)
    .set({
      status: pendingHumanReview ? "submitted" : "graded",
      submittedAt: new Date(),
      score: overall,
      percentile,
      passed,
      competencyScores: compScores,
    })
    .where(eq(attempts.id, attempt.id));

  // Scope to this attempt's own invitation. Matching on assessmentId alone
  // would mark every other candidate's invitation as submitted.
  await db
    .update(assessmentInvitations)
    .set({ status: "submitted" })
    .where(eq(assessmentInvitations.id, attempt.invitationId ?? ""));

  return NextResponse.json({
    ok: true,
    score: overall,
    percentile,
    passed,
    pendingHumanReview,
    itemsPendingReview: stillPending,
    competencyScores: Object.keys(compScores).length ? compScores : undefined,
  });
}

