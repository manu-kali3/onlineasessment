import type {
  Question,
  Response,
  Competency,
} from "@/db/schema";

/**
 * Objective scoring. Subjective items (free text, video, situational judgment)
 * return `pendingReview` so the assessor UI can queue them.
 */
export type AutoGradeResult = {
  isCorrect: boolean | null;
  awardedScore: number | null;
  needsHumanReview: boolean;
};

const SUBJECTIVE_TYPES = new Set(["free_text", "video"]);

export function isAutoGradable(q: Pick<Question, "type">) {
  return !SUBJECTIVE_TYPES.has(q.type);
}

export function gradeObjective(
  question: Question,
  answer: Response["answer"],
): AutoGradeResult {
  if (!isAutoGradable(question)) {
    return { isCorrect: null, awardedScore: null, needsHumanReview: true };
  }

  const expected = question.correctAnswer;
  if (expected === null || expected === undefined) {
    return { isCorrect: null, awardedScore: null, needsHumanReview: true };
  }

  if (question.type === "multiple_choice" || question.type === "multi_select") {
    const expectedIds = Array.isArray(expected) ? expected : [expected];
    const givenIds = Array.isArray(answer) ? answer : answer ? [answer] : [];

    if (question.type === "multi_select") {
      // Partial credit: 1 point per correct pick, minus 1 per wrong pick, floored at 0
      const correctPicked = givenIds.filter((id) => expectedIds.includes(id)).length;
      const wrongPicked = givenIds.filter((id) => !expectedIds.includes(id)).length;
      const credit = Math.max(0, (correctPicked - wrongPicked) / expectedIds.length);
      return {
        isCorrect: credit === 1,
        awardedScore: credit * 100,
        needsHumanReview: false,
      };
    }

    const hit = givenIds.length === 1 && givenIds[0] === expectedIds[0];
    return { isCorrect: hit, awardedScore: hit ? 100 : 0, needsHumanReview: false };
  }

  if (question.type === "true_false") {
    const hit = answer === expected;
    return { isCorrect: hit, awardedScore: hit ? 100 : 0, needsHumanReview: false };
  }

  if (question.type === "coding") {
    return { isCorrect: null, awardedScore: null, needsHumanReview: true };
  }

  return { isCorrect: null, awardedScore: null, needsHumanReview: true };
}

/** Aggregate weighted responses into a 0-100 percentage. */
export function computeOverallScore(
  items: { awardedScore: number | null; weight: number }[],
): number {
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    possible += item.weight * 100;
    earned += item.weight * (item.awardedScore ?? 0);
  }
  if (possible === 0) return 0;
  return round2((earned / possible) * 100);
}

export function computeCompetencyScores(
  items: { competencyId: string | null; awardedScore: number | null; weight: number }[],
  allCompetencies: Pick<Competency, "id">[],
): Record<string, number> {
  const buckets = new Map<string, { earned: number; possible: number }>();
  for (const c of allCompetencies) {
    buckets.set(c.id, { earned: 0, possible: 0 });
  }
  for (const item of items) {
    if (!item.competencyId) continue;
    const b = buckets.get(item.competencyId);
    if (!b) continue;
    b.possible += item.weight * 100;
    b.earned += item.weight * (item.awardedScore ?? 0);
  }
  const out: Record<string, number> = {};
  for (const [id, b] of buckets) {
    if (b.possible > 0) out[id] = round2((b.earned / b.possible) * 100);
  }
  return out;
}

/**
 * Percentile of `score` within the ordered set of all attempt scores.
 * Linear interpolation between neighbours.
 */
export function computePercentile(score: number, allScores: number[]): number {
  if (allScores.length === 0) return 0;
  const sorted = [...allScores].sort((a, b) => a - b);
  if (sorted.length === 1) return 100;
  let below = 0;
  for (const s of sorted) if (s < score) below++;
  const equal = sorted.filter((s) => s === score).length;
  return round2(((below + equal / 2) / sorted.length) * 100);
}

/**
 * Integrity score from proctoring signals. Starts at 100 and is decremented by
 * severity-weighted penalties. Deliberately conservative: it flags for human
 * review rather than auto-failing a candidate.
 */
const PENALTIES = { info: 0, warning: 1, critical: 5 } as const;

export function computeIntegrityScore(
  severities: (keyof typeof PENALTIES)[],
): number {
  const total = severities.reduce((acc, s) => acc + PENALTIES[s], 0);
  return Math.max(0, round2(100 - total));
}

export function integrityVerdict(score: number) {
  if (score >= 90) return "clean" as const;
  if (score >= 70) return "review" as const;
  return "high_risk" as const;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}