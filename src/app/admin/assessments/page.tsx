export const dynamic = "force-dynamic";

import { db } from "@/db";
import { eq } from "drizzle-orm";
import {
  assessmentQuestions,
  assessments,
  competencies,
  questions,
} from "@/db/schema";
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import { TableWrap } from "@/components/TableWrap";
import QuestionEditor, { CoursePriceEditor } from "@/components/QuestionEditor";
import { formatKes } from "@/lib/pricing";
import { adminNav } from "@/lib/admin-nav";
import {
  Chevron,
  EmptyState,
  PercentBar,
  StatusTag,
  Tag,
} from "@/components/admin/ui";

export default async function AssessmentsPage() {
  const user = await requirePageUser("recruiter", "assessor", "admin");

  const rows = await db
    .select({
      id: assessments.id,
      title: assessments.title,
      description: assessments.description,
      status: assessments.status,
      delivery: assessments.delivery,
      durationMin: assessments.durationMin,
      priceMinor: assessments.priceMinor,
      vatMinor: assessments.vatMinor,
      passMark: assessments.passMark,
      requireProctoring: assessments.requireProctoring,
      blindReview: assessments.blindReview,
    })
    .from(assessments)
    .orderBy(assessments.createdAt);

  const compRows = await db.select().from(competencies);

  const links = await db
    .select({
      assessmentId: assessmentQuestions.assessmentId,
      questionId: assessmentQuestions.questionId,
      position: assessmentQuestions.position,
      type: questions.type,
      prompt: questions.prompt,
      difficulty: questions.difficulty,
      competency: competencies.name,
    })
    .from(assessmentQuestions)
    .innerJoin(questions, eq(questions.id, assessmentQuestions.questionId))
    .leftJoin(competencies, eq(competencies.id, questions.competencyId))
    .orderBy(assessmentQuestions.position);

  const byAssessment = new Map<string, typeof links>();
  for (const l of links) {
    const list = byAssessment.get(l.assessmentId) ?? [];
    list.push(l);
    byAssessment.set(l.assessmentId, list);
  }

  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />

      <div className="shell">
        <h1 className="page-title">Test authoring</h1>
        <p className="page-sub">
          Build courses from your own questions, and set each one free or paid.
          Candidates pay only for the course they enrol in.
        </p>

        {rows.length === 0 && (
          <div className="mt-6">
            <EmptyState>
              No assessments yet. Seed a content pack with{" "}
              <code className="code">npm run db:seed</code> to get started.
            </EmptyState>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {rows.map((a) => {
            const items = byAssessment.get(a.id) ?? [];
            const total = a.priceMinor + (a.vatMinor ?? 0);
            const objective = items.filter(
              (q) =>
                q.type === "multiple_choice" ||
                q.type === "multi_select" ||
                q.type === "true_false",
            ).length;

            return (
              <section key={a.id} className="panel overflow-hidden">
                {/* Course header: identity, stats, and price in one band. */}
                <div className="border-b border-[var(--line)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[1.05rem] font-semibold tracking-tight">
                          {a.title}
                        </h2>
                        <StatusTag status={a.status} />
                      </div>
                      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
                        {a.description}
                      </p>

                      <dl className="meta mt-3">
                        <div>
                          <dt>Items</dt>
                          <dd>{items.length}</dd>
                        </div>
                        <div>
                          <dt>Auto-graded</dt>
                          <dd>
                            {objective}/{items.length}
                          </dd>
                        </div>
                        <div>
                          <dt>Duration</dt>
                          <dd>{a.durationMin} min</dd>
                        </div>
                        <div>
                          <dt>Pass mark</dt>
                          <dd>{a.passMark !== null ? `${a.passMark}%` : "—"}</dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Tag>{a.delivery}</Tag>
                        {a.requireProctoring && (
                          <Tag tone="warn">Proctored</Tag>
                        )}
                        {a.blindReview && <Tag tone="accent">Blind</Tag>}
                        {/* An item set with nothing auto-gradable cannot produce
                            a score without an assessor, which is worth saying
                            where the course is configured. */}
                        {items.length > 0 && objective === 0 && (
                          <Tag tone="warn">Assessor-scored only</Tag>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 rounded-[10px] border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-right">
                      <div className="stat-label">Price</div>
                      {a.priceMinor === 0 ? (
                        <div className="mt-0.5 text-lg font-bold text-[var(--good)]">
                          Free
                        </div>
                      ) : (
                        <>
                          <div className="mt-0.5 text-lg font-bold tabular-nums">
                            {formatKes(total)}
                          </div>
                          <div className="mt-0.5 text-[0.7rem] text-[var(--faint)]">
                            {formatKes(a.priceMinor)} +{" "}
                            {formatKes(a.vatMinor ?? 0)} VAT
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Question bank: collapsed by default so the page stays a list
                    of courses rather than a wall of every question ever made. */}
                {items.length > 0 && (
                  <details className="group border-b border-[var(--line)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold hover:bg-[var(--panel-2)]">
                      <span>
                        Question bank
                        <span className="ml-2 font-normal text-[var(--faint)]">
                          {items.length} item{items.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <Chevron />
                    </summary>
                    <div className="px-5 pb-5">
                      <TableWrap label={`${a.title} questions`}>
                        <table className="table">
                          <thead>
                            <tr>
                              <th className="num">#</th>
                              <th>Type</th>
                              <th>Question</th>
                              <th>Competency</th>
                              <th>Difficulty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((q) => (
                              <tr key={q.questionId}>
                                <td className="num text-[var(--faint)]">
                                  {q.position}
                                </td>
                                <td>
                                  <span className="text-xs text-[var(--muted)] capitalize">
                                    {q.type.replace(/_/g, " ")}
                                  </span>
                                </td>
                                <td className="max-w-md">
                                  <span className="line-clamp-2">
                                    {q.prompt}
                                  </span>
                                </td>
                                <td className="text-xs text-[var(--muted)]">
                                  {q.competency ?? "—"}
                                </td>
                                <td>
                                  {q.difficulty !== null ? (
                                    <PercentBar
                                      value={Math.round(q.difficulty * 100)}
                                      tone="accent"
                                    />
                                  ) : (
                                    <span className="text-[var(--faint)]">
                                      —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableWrap>
                    </div>
                  </details>
                )}

                {/* Authoring actions, also collapsed: two full forms per course
                    made this page thousands of pixels tall. */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold hover:bg-[var(--panel-2)]">
                    <span>
                      Add a question or change the price
                      <span className="ml-2 font-normal text-[var(--faint)]">
                        {a.title}
                      </span>
                    </span>
                    <Chevron />
                  </summary>
                  <div className="space-y-4 px-5 pb-5">
                    <QuestionEditor
                      competencies={compRows}
                      assessmentId={a.id}
                      assessmentTitle={a.title}
                      embedded
                    />
                    <CoursePriceEditor
                      assessmentId={a.id}
                      title={a.title}
                      priceMinor={a.priceMinor}
                      vatMinor={a.vatMinor ?? 0}
                      embedded
                    />
                  </div>
                </details>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
