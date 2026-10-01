export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, attempts, competencies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {assessment?.title ?? "Assessment"} result
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {attempt.status === "graded"
            ? "Auto-graded and complete. Every item has been scored."
            : "Submitted. The score below covers the auto-graded items only — written and video responses are awaiting assessor review, and the final score and outcome follow."}
        </p>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="panel p-5">
            <div className="text-sm font-semibold text-[var(--muted)]">
              Overall score
              {attempt.status === "submitted" && " (provisional)"}
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums">
              {attempt.score !== null ? `${attempt.score}%` : "—"}
            </div>
          </div>
          <div className="panel p-5">
            <div className="text-sm font-semibold text-[var(--muted)]">Percentile</div>
            <div className="mt-1 text-4xl font-bold tabular-nums">
              {attempt.percentile !== null ? attempt.percentile : "—"}
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              vs. {assessment?.normGroup ?? "norm group"}
            </div>
          </div>
          <div className="panel p-5">
            <div className="text-sm font-semibold text-[var(--muted)]">Outcome</div>
            <div className="mt-2">
              {attempt.passed === null ? (
                <span className="tag">Pending assessor review</span>
              ) : attempt.passed ? (
                <span className="tag tag-good">Passed</span>
              ) : (
                <span className="tag tag-bad">Not passed</span>
              )}
            </div>
          </div>
        </section>

        {breakdown.length > 0 && (
          <section className="panel mt-6 p-5">
            <h2 className="text-base font-semibold">Competency breakdown</h2>
            <ul className="mt-4 space-y-3">
              {breakdown.map(([compId, score]) => (
                <li key={compId}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{nameById.get(compId) ?? compId}</span>
                    <span className="font-semibold tabular-nums">{score}%</span>
                  </div>
                  <div
                    className="mt-1 h-2 overflow-hidden rounded-full bg-black/10"
                    role="progressbar"
                    aria-valuenow={score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${nameById.get(compId) ?? compId} score`}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
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