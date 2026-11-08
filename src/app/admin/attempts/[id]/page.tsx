
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageUser } from "@/lib/page-auth";
import { loadAttemptDetail } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { fmtDuration } from "@/lib/time-on-task";
import { TableWrap } from "@/components/TableWrap";

export const dynamic = "force-dynamic";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];
export default async function AttemptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser("recruiter", "assessor", "admin");
  const detail = await loadAttemptDetail(id, user.role);
  if (!detail) notFound();
  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="mx-auto w-full max-w-5xl px-4 pt-7 pb-16 sm:px-6">
        <Link href="/admin/analytics" className="btn btn-quiet btn-sm -ml-2">
          ← Back to analytics
        </Link>
        <h1 className="page-title mt-3">
          {detail.attempt.assessmentTitle}
        </h1>
        <p className="page-sub">
          {detail.attempt.candidate.fullName}
          {detail.attempt.blindReview && " · blind review active"}
        </p>
        <section className="mt-5 grid gap-3 sm:grid-cols-4">
          <Tile label="Score" value={detail.attempt.score !== null ? `${detail.attempt.score}%` : "—"} />
          <Tile label="Percentile" value={detail.attempt.percentile ?? "—"} />
          <Tile label="Integrity" value={detail.attempt.integrityScore ?? "—"} />
          <Tile label="Status" value={detail.attempt.status.replace("_", " ")} />
        </section>
        <section className="panel mt-6 p-5">
          <h2 className="text-base font-semibold">Per-question analytics</h2>
          <TableWrap className="mt-3">

              <table className="table">
                <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Prompt</th>
                <th>Result</th>
                <th>Time</th>
                <th>Edits</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item, i) => (
                <tr key={item.questionId}>
                  <td className="tabular-nums">{item.position ?? i + 1}</td>
                  <td className="text-xs">{item.type.replace("_", " ")}</td>
                  <td className="max-w-sm">
                    <div className="truncate font-medium">{item.prompt}</div>
                    {item.competency && (
                      <div className="text-xs text-[var(--muted)]">{item.competency}</div>
                    )}
                    {item.answerRedacted ? (
                      <div className="mt-1 text-xs tag tag-warn inline-block">
                        Response withheld during blind review
                      </div>
                    ) : item.answer !== null && item.answer !== undefined ? (
                      <pre className="mt-1 max-w-sm overflow-x-auto rounded bg-black/5 p-2 text-xs">
{typeof item.answer === "string"
  ? item.answer.slice(0, 200)
  : JSON.stringify(item.answer).slice(0, 200)}
                      </pre>
                    ) : null}
                  </td>
                  <td>
                    {item.isCorrect === null || item.isCorrect === undefined ? (
                      <span className="tag tag-warn">Pending review</span>
                    ) : item.isCorrect ? (
                      <span className="tag tag-good">Correct</span>
                    ) : (
                      <span className="tag tag-bad">Incorrect</span>
                    )}
                    {item.codeResult && (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {item.codeResult.passed
                          ? `${item.codeResult.totalTests - item.codeResult.failedTests}/${item.codeResult.totalTests} tests passed`
                          : `${item.codeResult.failedTests}/${item.codeResult.totalTests} tests failed`}
                      </div>
                    )}
                  </td>
                  <td className="tabular-nums">{fmtDuration(item.durationMs)}</td>
                  <td className="tabular-nums">{item.attemptsCount}</td>
                </tr>
              ))}
              {detail.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-[var(--muted)]">
                    No responses recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          </TableWrap>
        </section>
        <section className="panel mt-4 p-5">
          <h2 className="text-base font-semibold">Proctoring signals</h2>
          {detail.proctorEvents.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">No signals recorded.</p>
          ) : (
            <TableWrap className="mt-3">

                <table className="table">
                  <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Severity</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {detail.proctorEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular-nums text-xs">
                      {new Date(e.occurredAt).toLocaleTimeString()}
                    </td>
                    <td className="font-mono text-xs">{e.type}</td>
                    <td>
                      <span
                        className={`tag ${
                          e.severity === "critical"
                            ? "tag-bad"
                            : e.severity === "warning"
                              ? "tag-warn"
                              : ""
                        }`}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="text-xs">{e.resolution ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            </TableWrap>
          )}
        </section>
      </div>
    </main>
  );
}
function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value !text-[1.5rem]">{value}</div>
    </div>
  );
}
