import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  assessmentInvitations,
  assessments,
  assessmentQuestions,
  attempts,
  competencies,
  proctorEvents,
  questions,
  recordings,
  responses,
  users,
} from "@/db/schema";
import { computeIntegrityScore } from "@/lib/scoring";

export type DashboardData = {
  counts: {
    published: number;
    drafts: number;
    awaitingReview: number;
    inProgress: number;
    flagged: number;
  };
  averageScore: number | null;
  normGroup: string | null;
  topAssessments: {
    id: string;
    title: string;
    completed: number;
    avgScore: number | null;
    passRate: number | null;
  }[];
  recentAttempts: {
    id: string;
    candidateName: string;
    assessmentTitle: string;
    status: string;
    score: number | null;
    percentile: number | null;
    integrityScore: number | null;
    submittedAt: Date | null;
  }[];
  riskQueue: {
    attemptId: string;
    candidateName: string;
    integrityScore: number;
    criticalEvents: number;
  }[];
};

export async function loadRecruiterDashboard(
  viewerRole: "candidate" | "recruiter" | "assessor" | "admin" = "recruiter",
): Promise<DashboardData> {
  const [assessmentRows, attemptRows, userRows, proctorRows] = await Promise.all([
    db.select().from(assessments),
    db.select().from(attempts),
    db.select({ id: users.id, fullName: users.fullName }).from(users),
    db.select().from(proctorEvents),
  ]);

  const nameById = new Map(userRows.map((u) => [u.id, u.fullName]));
  const titleById = new Map(assessmentRows.map((a) => [a.id, a.title]));

  const awaitingReview = attemptRows.filter(
    (a) => a.status === "submitted" || a.status === "graded",
  ).length;
  const inProgress = attemptRows.filter((a) => a.status === "in_progress").length;
  const scored = attemptRows.filter((a) => typeof a.score === "number");

  const eventsByAttempt = new Map<string, { severities: string[] }>();
  for (const e of proctorRows) {
    const bucket = eventsByAttempt.get(e.attemptId) ?? { severities: [] };
    bucket.severities.push(e.severity);
    eventsByAttempt.set(e.attemptId, bucket);
  }

  const flagged = attemptRows.filter((a) => {
    if (a.integrityScore !== null) return a.integrityScore < 90;
    const bucket = eventsByAttempt.get(a.id);
    if (!bucket) return false;
    return computeIntegrityScore(bucket.severities as never[]) < 90;
  }).length;

  const averageScore = scored.length
    ? Math.round(
        (scored.reduce((sum, a) => sum + (a.score ?? 0), 0) / scored.length) * 10,
      ) / 10
    : null;

  const topAssessments = assessmentRows
    .map((assessment) => {
      const related = attemptRows.filter((a) => a.assessmentId === assessment.id);
      const done = related.filter((a) => typeof a.score === "number");
      const passed = done.filter((a) => a.passed === true).length;
      return {
        id: assessment.id,
        title: assessment.title,
        completed: done.length,
        avgScore: done.length
          ? Math.round((done.reduce((s, a) => s + (a.score ?? 0), 0) / done.length) * 10) / 10
          : null,
        passRate: done.length ? Math.round((passed / done.length) * 100) : null,
      };
    })
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);

  const recentAttempts = [...attemptRows]
    .sort((a, b) => {
      const at = a.submittedAt ?? a.createdAt;
      const bt = b.submittedAt ?? b.createdAt;
      return bt.getTime() - at.getTime();
    })
    .slice(0, 8)
    .map((a) => ({
      id: a.id,
      // Identities are admin-only. Recruiters and assessors see a stable
      // pseudonym so blind review holds, including in the serialised payload.
      candidateName:
        viewerRole === "admin"
          ? (nameById.get(a.candidateId) ?? "Unknown")
          : `${shortRef(a.id)}`,
      assessmentTitle: titleById.get(a.assessmentId) ?? "—",
      status: a.status,
      score: a.score,
      percentile: a.percentile,
      integrityScore: a.integrityScore,
      submittedAt: a.submittedAt,
    }));

  const riskQueue = attemptRows
    .map((a) => {
      const bucket = eventsByAttempt.get(a.id);
      const score =
        a.integrityScore ??
        (bucket
          ? computeIntegrityScore(bucket.severities as never[])
          : 100);
      return {
        attemptId: a.id,
        candidateName:
          viewerRole === "admin"
            ? (nameById.get(a.candidateId) ?? "Unknown")
            : shortRef(a.id),
        integrityScore: score,
        criticalEvents: proctorRows.filter(
          (e) => e.attemptId === a.id && e.severity === "critical",
        ).length,
      };
    })
    .filter((r) => r.integrityScore < 90)
    .sort((a, b) => a.integrityScore - b.integrityScore)
    .slice(0, 5);

  return {
    counts: {
      published: assessmentRows.filter((a) => a.status === "published").length,
      drafts: assessmentRows.filter((a) => a.status === "draft").length,
      awaitingReview,
      inProgress,
      flagged,
    },
    averageScore,
    normGroup: assessmentRows.find((a) => a.normGroup)?.normGroup ?? null,
    topAssessments,
    recentAttempts,
    riskQueue,
  };
}

export type InvitationWithMeta = {
  id: string;
  token: string;
  status: string;
  expiresAt: Date;
  assessment: {
    id: string;
    title: string;
    description: string | null;
    durationMin: number;
    requireProctoring: boolean;
  };
  attemptId: string | null;
  attemptStatus: string | null;
  score: number | null;
  percentile: number | null;
  startedAt: Date | null;
  submittedAt: Date | null;
};

export async function loadCandidateInvitations(candidateId: string) {
  const rows = await db
    .select({
      id: assessmentInvitations.id,
      token: assessmentInvitations.token,
      status: assessmentInvitations.status,
      expiresAt: assessmentInvitations.expiresAt,
      assessmentId: assessments.id,
      title: assessments.title,
      description: assessments.description,
      durationMin: assessments.durationMin,
      requireProctoring: assessments.requireProctoring,
    })
    .from(assessmentInvitations)
    .innerJoin(assessments, eq(assessments.id, assessmentInvitations.assessmentId))
    .where(eq(assessmentInvitations.candidateId, candidateId));

  const attemptRows = rows.length
    ? await db
        .select()
        .from(attempts)
        .where(inArray(attempts.invitationId, rows.map((r) => r.id)))
    : [];

  const attemptByInvitation = new Map(attemptRows.map((a) => [a.invitationId, a]));

  return rows.map<InvitationWithMeta>((r) => {
    const attempt = attemptByInvitation.get(r.id);
    return {
      id: r.id,
      token: r.token,
      status: attempt?.status ?? r.status,
      expiresAt: r.expiresAt,
      assessment: {
        id: r.assessmentId,
        title: r.title,
        description: r.description,
        durationMin: r.durationMin,
        requireProctoring: r.requireProctoring,
      },
      attemptId: attempt?.id ?? null,
      attemptStatus: attempt?.status ?? null,
      score: attempt?.score ?? null,
      percentile: attempt?.percentile ?? null,
      startedAt: attempt?.startedAt ?? null,
      submittedAt: attempt?.submittedAt ?? null,
    };
  });
}

export async function loadRecordingCount(attemptId: string) {
  const rows = await db.select().from(recordings).where(eq(recordings.attemptId, attemptId));
  return rows.length;
}

export type BlindQueue = {
  blindReviewActive: boolean;
  queue: {
    candidateRef: string;
    candidateName: string;
    attemptId: string;
    assessmentTitle: string;
    score: number | null;
    percentile: number | null;
    status: string;
    needsReview: boolean;
  }[];
  itemStats: {
    questionId: string;
    type: string;
    attempts: number;
    correctRate: number | null;
    medianTimeLabel: string;
  }[];
};

/** Aggregate review queue plus per-item analytics across the whole bank. */
export async function loadBlindQueue(
  viewerRole: "candidate" | "recruiter" | "assessor" | "admin",
): Promise<BlindQueue> {
  const [attemptRows, userRows, assessmentRows, responseRows, questionRows] =
    await Promise.all([
      db.select().from(attempts),
      db.select({ id: users.id, fullName: users.fullName }).from(users),
      db.select().from(assessments),
      db.select().from(responses),
      db.select().from(questions),
    ]);

  const nameById = new Map(userRows.map((u) => [u.id, u.fullName]));
  const titleById = new Map(assessmentRows.map((a) => [a.id, a.title]));
  const blindByAssessment = new Map(
    assessmentRows.map((a) => [a.id, a.blindReview]),
  );

  const submitted = attemptRows
    .filter((a) => a.status === "submitted" || a.status === "graded")
    .sort((a, b) => {
      const at = (a.submittedAt ?? a.createdAt).getTime();
      const bt = (b.submittedAt ?? b.createdAt).getTime();
      return bt - at;
    });

  const queue = submitted.map((a, i) => ({
    candidateRef: `${String(i + 1).padStart(3, "0")}-${shortRef(a.id)}`,
    // Blanket-redact the name unless the viewer is an admin. The UI already
    // hides it during blind review, but this value is also serialised into the
    // RSC payload and would otherwise be readable in view-source — which would
    // defeat blind review entirely.
    candidateName: viewerRole === "admin" ? (nameById.get(a.candidateId) ?? "Unknown") : "—",
    attemptId: a.id,
    assessmentTitle: titleById.get(a.assessmentId) ?? "—",
    score: a.score,
    percentile: a.percentile,
    status: a.status,
    needsReview: a.status === "submitted",
  }));

  const questionTypeById = new Map(questionRows.map((q) => [q.id, q.type]));

  const grouped = new Map<
    string,
    { correct: number; total: number; durations: number[] }
  >();
  for (const r of responseRows) {
    if (r.isCorrect === null || r.isCorrect === undefined) continue;
    const bucket =
      grouped.get(r.questionId) ?? { correct: 0, total: 0, durations: [] };
    bucket.total += 1;
    if (r.isCorrect) bucket.correct += 1;
    if (r.durationMs !== null) bucket.durations.push(r.durationMs);
    grouped.set(r.questionId, bucket);
  }

  const itemStats = [...grouped.entries()].map(([questionId, bucket]) => ({
    questionId,
    type: questionTypeById.get(questionId) ?? "unknown",
    attempts: bucket.total,
    correctRate:
      bucket.total > 0
        ? Math.round((bucket.correct / bucket.total) * 1000) / 10
        : null,
    medianTimeLabel: medianDuration(bucket.durations),
  }));

  return {
    blindReviewActive: [...blindByAssessment.values()].some(Boolean),
    queue,
    itemStats,
  };
}

function medianDuration(values: number[]) {
  if (values.length === 0) return "—";
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const ms =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return ms < 1000 ? `${Math.round(ms)} ms` : `${Math.round(ms / 1000)} s`;
}

function shortRef(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}

export type AttemptDetail = Awaited<ReturnType<typeof loadAttemptDetail>>;

/**
 * Granular per-question analytics. Identity fields are stripped for assessors so
 * blind review holds even on the detail endpoint, not just the list view.
 */
export async function loadAttemptDetail(
  attemptId: string,
  viewerRole: "candidate" | "recruiter" | "assessor" | "admin",
) {
  const [attempt] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, attemptId));
  if (!attempt) return null;

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, attempt.assessmentId));

  const items = await db
    .select({
      response: responses,
      question: questions,
      position: assessmentQuestions.position,
      weight: assessmentQuestions.weight,
      competencyName: competencies.name,
    })
    .from(responses)
    .innerJoin(questions, eq(questions.id, responses.questionId))
    .leftJoin(
      assessmentQuestions,
      and(
        eq(assessmentQuestions.questionId, responses.questionId),
        eq(assessmentQuestions.assessmentId, attempt.assessmentId),
      ),
    )
    .leftJoin(competencies, eq(competencies.id, questions.competencyId))
    .where(eq(responses.attemptId, attemptId))
    .orderBy(assessmentQuestions.position);

  const proctorRows = await db
    .select()
    .from(proctorEvents)
    .where(eq(proctorEvents.attemptId, attemptId))
    .orderBy(proctorEvents.occurredAt);

  const blind = assessment?.blindReview !== false && viewerRole !== "admin";
  const [candidate] = blind
    ? []
    : await db
        .select({ fullName: users.fullName, email: users.email })
        .from(users)
        .where(eq(users.id, attempt.candidateId));

  return {
    attempt: {
      id: attempt.id,
      assessmentTitle: assessment?.title ?? "—",
      status: attempt.status,
      score: attempt.score,
      percentile: attempt.percentile,
      passed: attempt.passed,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      integrityScore: attempt.integrityScore,
      competencyScores: attempt.competencyScores,
      blindReview: blind,
      candidate: candidate
        ? { fullName: candidate.fullName, email: candidate.email }
        : { fullName: "Hidden (blind review)", email: "Hidden (blind review)" },
    },
    items: items.map((i) => ({
      questionId: i.question.id,
      position: i.position,
      type: i.question.type,
      prompt: i.question.prompt,
      competency: i.competencyName,
      weight: i.weight,
      isCorrect: i.response.isCorrect,
      awardedScore: i.response.awardedScore,
      durationMs: i.response.durationMs,
      attemptsCount: i.response.attemptsCount,
      codeResult: i.response.codeResult,
      assessorComment: i.response.assessorComment,
      answer: blind
        ? i.response.answer
        : // Free text and video answers can contain identifying detail
          i.question.type === "multiple_choice" ||
          i.question.type === "multi_select" ||
          i.question.type === "true_false"
          ? i.response.answer
          : null,
      answerRedacted: blind && (i.question.type === "free_text" || i.question.type === "video"),
    })),
    proctorEvents: proctorRows.map((e) => ({
      id: e.id,
      type: e.type,
      severity: e.severity,
      occurredAt: e.occurredAt,
      reviewed: e.reviewed,
      resolution: e.resolution,
    })),
  };
}