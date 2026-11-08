
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, attempts, competencies } from "@/db/schema";
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function ResultPage({
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
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, attempt.assessmentId));
  const compRows = await db.select().from(competencies);
  const nameById = new Map(compRows.map((c) => [c.id, c.name]));
  const breakdown = Object.entries(attempt.competencyScores ?? {}).filter(
    ([, v]) => typeof v === "number",
  ) as [string, number][];
  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={[{ href: "/candidate", label: "My assessments" }]} />
      <div className="mx-auto w-full max-w-4xl px-4 pt-7 pb-16 sm:px-6">
        <h1 className="page-title">
          {assessment?.title ?? "Assessment"} result
        </h1>
        <p className="page-sub">
          {attempt.status === "graded"
            ? "Auto-graded and complete. Every item has been scored."
            : "Submitted. The score below covers the auto-graded items only — written and video responses are awaiting assessor review, and the final score and outcome follow."}
        </p>
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="panel stat stat-accent">
            <div className="stat-label">
              Overall score
              {attempt.status === "submitted" && " · provisional"}
            </div>
            <div className="stat-value !text-[2.1rem]">
              {attempt.score !== null ? `${attempt.score}%` : "—"}
            </div>
          </div>
          <div className="panel stat">
            <div className="stat-label">Percentile</div>
            <div className="stat-value !text-[2.1rem]">
              {attempt.percentile !== null ? attempt.percentile : "—"}
            </div>
            <div className="mt-1 text-[0.72rem] text-[var(--faint)]">
              vs. {assessment?.normGroup ?? "norm group"}
            </div>
          </div>
          <div className="panel stat">
            <div className="stat-label">Outcome</div>
            <div className="mt-2">
              {attempt.passed === null ? (
                <span className="tag tag-dot">Pending assessor review</span>
              ) : attempt.passed ? (
                <span className="tag tag-good tag-dot">Passed</span>
              ) : (
                <span className="tag tag-bad tag-dot">Not passed</span>
              )}
            </div>
          </div>
        </section>
        {breakdown.length > 0 && (
          <section className="panel mt-6 p-5">
            <div className="section-head">
              <h2 className="text-[0.98rem] font-semibold tracking-tight">
                Competency breakdown
              </h2>
              <span className="text-xs text-[var(--faint)]">
                graded items only
              </span>
            </div>
            <ul className="mt-4 space-y-3">
              {breakdown.map(([compId, score]) => (
                <li key={compId}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{nameById.get(compId) ?? compId}</span>
                    <span className="font-semibold tabular-nums">{score}%</span>
                  </div>
                  <div
                    className={`meter mt-1.5 ${
                      score >= 70
                        ? "meter-good"
                        : score >= 40
                          ? "meter-warn"
                          : "meter-bad"
                    }`}
                    role="progressbar"
                    aria-valuenow={score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${nameById.get(compId) ?? compId} score`}
                  >
                    <span
                      style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="mt-6">
          <Link href="/candidate" className="btn btn-ghost">
            ← Back to my assessments
          </Link>
        </div>
      </div>
    </main>
  );
}
