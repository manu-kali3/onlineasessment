
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assessments,
  assessmentQuestions,
  attempts,
  questions,
  responses,
} from "@/db/schema";
import { requirePageUser } from "@/lib/page-auth";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import TestRunner, { type RunnerQuestion } from "@/components/TestRunner";

export const dynamic = "force-dynamic";

export default async function TestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser("candidate");
  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, id), eq(attempts.candidateId, user.id)));
  if (!attempt) notFound();
  if (attempt.status === "submitted" || attempt.status === "graded") {
    redirect(`/candidate/results/${attempt.id}`);
  }
  if (!attempt.startedAt) redirect("/candidate");
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, attempt.assessmentId));
  if (!assessment) notFound();
  const linked = await db
    .select({
      question: questions,
      position: assessmentQuestions.position,
    })
    .from(assessmentQuestions)
    .innerJoin(questions, eq(questions.id, assessmentQuestions.questionId))
    .where(eq(assessmentQuestions.assessmentId, attempt.assessmentId))
    .orderBy(assessmentQuestions.position);
  const stored = await db
    .select()
    .from(responses)
    .where(eq(responses.attemptId, attempt.id));
  const answerByQuestion = new Map(stored.map((r) => [r.questionId, r.answer]));
  const runnerQuestions: RunnerQuestion[] = linked.map((l) => ({
    id: l.question.id,
    type: l.question.type,
    prompt: l.question.prompt,
    options: l.question.options ?? [],
    codingSpec: l.question.codingSpec ?? null,
    timeLimitSec: l.question.timeLimitSec,
  }));
  const a11y = user.accessibilityProfile ?? {};
  return (
    <AccessibilityProvider initial={a11y}>
      <TestRunner
        attemptId={attempt.id}
        title={assessment.title}
        questions={runnerQuestions}
        initialResponses={runnerQuestions.map((q) => ({
          questionId: q.id,
          answer: answerByQuestion.get(q.id) ?? null,
          durationMs: 0,
        }))}
        startedAtMs={attempt.startedAt.getTime()}
        durationMin={assessment.durationMin}
        timeExtensionPct={a11y.timeExtensionPct ?? 0}
        proctoring={assessment.requireProctoring}
      />
    </AccessibilityProvider>
  );
}
