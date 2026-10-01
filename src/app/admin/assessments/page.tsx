import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { db } from "@/db";
import { assessments, assessmentQuestions, questions, competencies } from "@/db/schema";
import { eq } from "drizzle-orm";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];

export default async function AssessmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "candidate") redirect("/candidate");

  const rows = await db.select().from(assessments);
  const questionRows = await db
    .select({
      assessmentId: assessmentQuestions.assessmentId,
      questionId: assessmentQuestions.questionId,
      type: questions.type,
      difficulty: questions.difficulty,
      validated: questions.isValidated,
      competency: competencies.name,
    })
    .from(assessmentQuestions)
    .innerJoin(questions, eq(questions.id, assessmentQuestions.questionId))
    .leftJoin(competencies, eq(competencies.id, questions.competencyId))
    .orderBy(assessmentQuestions.position);

  const bank = await db.select().from(questions);

  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Test authoring</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Build assessments from the validated bank, then publish to invite
          candidates.
        </p>

        <section className="mt-6 grid gap-4">
          {rows.map((a) => {
            const items = questionRows.filter((q) => q.assessmentId === a.id);
            const unvalidated = items.filter((q) => !q.validated).length;
            return (
              <article key={a.id} className="panel p-5">
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
                      {a.passMark !== null && (
                        <span className="tag">pass ≥ {a.passMark}%</span>
                      )}
                      {a.requireProctoring && (
                        <span className="tag tag-warn">Proctored</span>
                      )}
                      {a.blindReview && <span className="tag">Blind</span>}
                      {unvalidated > 0 && (
                        <span className="tag tag-bad">
                          {unvalidated} unvalidated
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-primary">Publish / invite</button>
                </div>

                {items.length > 0 && (
                  <ol className="mt-4 space-y-1.5 border-t border-[var(--line)] pt-4">
                    {items.map((q) => (
                      <li
                        key={q.questionId}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span className="tag">{q.type.replace("_", " ")}</span>
                        <span className="truncate">{q.questionId}</span>
                        <span className="ml-auto text-xs text-[var(--muted)]">
                          {q.competency ?? "—"}
                          {q.difficulty !== null &&
                            ` · difficulty ${q.difficulty.toFixed(2)}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </section>

        <section className="panel mt-6 p-5">
          <h2 className="text-base font-semibold">
            Question bank ({bank.length})
          </h2>
          <table className="table mt-3">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Prompt</th>
                <th>Difficulty</th>
                <th>Validated</th>
              </tr>
            </thead>
            <tbody>
              {bank.map((q) => (
                <tr key={q.id}>
                  <td className="font-mono text-xs">{q.id}</td>
                  <td>{q.type.replace("_", " ")}</td>
                  <td className="max-w-md truncate">{q.prompt}</td>
                  <td className="tabular-nums">
                    {q.difficulty !== null ? q.difficulty.toFixed(2) : "—"}
                  </td>
                  <td>
                    {q.isValidated ? (
                      <span className="tag tag-good">Validated</span>
                    ) : (
                      <span className="tag tag-warn">Draft</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}