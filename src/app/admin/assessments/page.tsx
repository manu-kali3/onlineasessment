export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { assessmentQuestions, assessments, competencies, questions } from "@/db/schema";
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import { TableWrap } from "@/components/TableWrap";
import QuestionEditor, { CoursePriceEditor } from "@/components/QuestionEditor";
import { formatKes } from "@/lib/pricing";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];

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

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Test authoring</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Build courses from your own questions, and set each one free or paid.
          Candidates pay only for the course they enrol in.
        </p>

        {rows.map((a) => {
          const items = byAssessment.get(a.id) ?? [];
          const total = a.priceMinor + (a.vatMinor ?? 0);
          return (
            <section key={a.id} className="mt-6">
              <article className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{a.title}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                      {a.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span
                        className={`tag ${
                          a.status === "published"
                            ? "tag-good"
                            : a.status === "draft"
                              ? "tag-warn"
                              : ""
                        }`}
                      >
                        {a.status}
                      </span>
                      <span className="tag">{items.length} questions</span>
                      <span className="tag">{a.durationMin} min</span>
                      <span className="tag">{a.delivery}</span>
                      {a.passMark !== null && (
                        <span className="tag">pass ≥ {a.passMark}%</span>
                      )}
                      {a.requireProctoring && (
                        <span className="tag tag-warn">Proctored</span>
                      )}
                      {a.blindReview && <span className="tag">Blind</span>}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Price
                    </div>
                    <div className="mt-1">
                      {a.priceMinor === 0 ? (
                        <span className="tag tag-good">Free</span>
                      ) : (
                        <span className="text-lg font-bold">
                          {formatKes(total)}
                        </span>
                      )}
                    </div>
                    {a.priceMinor > 0 && (
                      <div className="text-xs text-[var(--muted)]">
                        {formatKes(a.priceMinor)} + {formatKes(a.vatMinor ?? 0)} VAT
                      </div>
                    )}
                  </div>
                </div>

                {items.length > 0 && (
                  <TableWrap className="mt-4" label={`${a.title} questions`}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Type</th>
                          <th>Question</th>
                          <th>Competency</th>
                          <th>Difficulty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((q) => (
                          <tr key={q.questionId}>
                            <td className="tabular-nums">{q.position}</td>
                            <td className="text-xs">{q.type.replace("_", " ")}</td>
                            <td className="max-w-md">
                              <span className="line-clamp-2">{q.prompt}</span>
                            </td>
                            <td className="text-xs">{q.competency ?? "—"}</td>
                            <td className="tabular-nums">
                              {q.difficulty !== null ? q.difficulty.toFixed(2) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </article>

              <QuestionEditor
                competencies={compRows}
                assessmentId={a.id}
                assessmentTitle={a.title}
              />
              <CoursePriceEditor
                assessmentId={a.id}
                title={a.title}
                priceMinor={a.priceMinor}
                vatMinor={a.vatMinor ?? 0}
              />
            </section>
          );
        })}

        {rows.length === 0 && (
          <p className="mt-6 rounded-md border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted)]">
            No assessments yet.
          </p>
        )}
      </div>
    </main>
  );
}
