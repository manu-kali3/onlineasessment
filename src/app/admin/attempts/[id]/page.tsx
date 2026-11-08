
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageUser } from "@/lib/page-auth";
import { loadAttemptDetail } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { fmtDuration } from "@/lib/time-on-task";
import { TableWrap } from "@/components/TableWrap";
import { adminNav } from "@/lib/admin-nav";
import {
  EmptyRow,
  EmptyState,
  PanelHead,
  StatusTag,
  Tag,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Integrity reads on a 0-100 scale where lower is worse, which is the opposite
 * of every other number on this page. Muting it into the same grey as score and
 * percentile would hide the one figure that routes an attempt to a human.
 */
function integrityTone(score: number | null) {
  if (score === null) return "neutral" as const;
  if (score >= 90) return "good" as const;
  if (score >= 70) return "warn" as const;
  return "bad" as const;
}
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

        <div className="section-head mt-3">
          <div className="min-w-0">
            <h1 className="page-title">{detail.attempt.assessmentTitle}</h1>
            <p className="page-sub">
              {detail.attempt.candidate.fullName}
              {detail.attempt.blindReview && (
                <span className="ml-2 text-[var(--faint)]">
                  · blind review active, answers withheld
                </span>
              )}
            </p>
          </div>
          <StatusTag status={detail.attempt.status} />
        </div>

        <section className="mt-5 grid gap-3 sm:grid-cols-4">
          <Tile
            label="Score"
            value={
              detail.attempt.score !== null
                ? `${detail.attempt.score}%`
                : "—"
            }
            tone="accent"
          />
          <Tile
            label="Percentile"
            value={detail.attempt.percentile ?? "—"}
          />
          <Tile
            label="Integrity"
            value={detail.attempt.integrityScore ?? "—"}
            tone={integrityTone(detail.attempt.integrityScore)}
            hint={
              detail.attempt.integrityScore !== null &&
              detail.attempt.integrityScore < 90
                ? "below the 90 review line"
                : undefined
            }
          />
          <Tile
            label="Items"
            value={`${detail.items.length}`}
            hint={`${
              detail.items.filter((i) => i.isCorrect === true).length
            } correct · ${
              detail.items.filter(
                (i) => i.isCorrect === null || i.isCorrect === undefined,
              ).length
            } pending`}
          />
        </section>
        <section className="panel mt-6 p-5">
          <PanelHead
            title="Per-question analytics"
            count={detail.items.length}
            hint="Time is the recorded time on task for the item; edits counts how many times the answer was saved, which is a rough signal of uncertainty."
          />
          <TableWrap className="mt-3" label="Per-question analytics">

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
                  <td className="num text-[var(--faint)]">
                    {item.position ?? i + 1}
                  </td>
                  <td>
                    <span className="text-xs text-[var(--muted)] capitalize">
                      {item.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="max-w-sm">
                    <div className="truncate font-medium">{item.prompt}</div>
                    {item.competency && (
                      <div className="text-xs text-[var(--muted)]">{item.competency}</div>
                    )}
                    {item.answerRedacted ? (
                      <div className="mt-1.5">
                        <Tag tone="warn">Response withheld during blind review</Tag>
                      </div>
                    ) : item.answer !== null && item.answer !== undefined ? (
                      <pre className="mt-1.5 max-w-sm overflow-x-auto rounded-[6px] border border-[var(--line)] bg-[var(--panel-2)] p-2 text-xs leading-relaxed whitespace-pre-wrap">
{typeof item.answer === "string"
  ? item.answer.slice(0, 200)
  : JSON.stringify(item.answer).slice(0, 200)}
                      </pre>
                    ) : null}
                  </td>
                  <td>
                    {item.isCorrect === null || item.isCorrect === undefined ? (
                      <Tag tone="warn">Pending review</Tag>
                    ) : item.isCorrect ? (
                      <Tag tone="good">Correct</Tag>
                    ) : (
                      <Tag tone="bad">Incorrect</Tag>
                    )}
                    {item.codeResult && (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {item.codeResult.passed
                          ? `${item.codeResult.totalTests - item.codeResult.failedTests}/${item.codeResult.totalTests} tests passed`
                          : `${item.codeResult.failedTests}/${item.codeResult.totalTests} tests failed`}
                      </div>
                    )}
                  </td>
                  <td className="num text-[var(--muted)]">
                    {fmtDuration(item.durationMs)}
                  </td>
                  <td className="num text-[var(--muted)]">
                    {item.attemptsCount}
                  </td>
                </tr>
              ))}
              {detail.items.length === 0 && (
                <EmptyRow colSpan={6}>No responses recorded.</EmptyRow>
              )}
            </tbody>
          </table>

          </TableWrap>
        </section>
        <section className="panel mt-4 p-5">
          <PanelHead
            title="Proctoring signals"
            count={detail.proctorEvents.length}
            hint="Signals are evidence for a human, never an automatic fail. A clean log here is not proof of integrity, and a noisy one is not proof of cheating."
          />
          {detail.proctorEvents.length === 0 ? (
            <div className="mt-3">
              <EmptyState>
                No signals recorded for this attempt.
              </EmptyState>
            </div>
          ) : (
            <TableWrap className="mt-3" label="Proctoring signals">

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
                    <td className="text-xs tabular-nums text-[var(--muted)]">
                      {new Date(e.occurredAt).toLocaleTimeString("en-GB")}
                    </td>
                    <td>
                      <span className="code">{e.type.replace(/_/g, " ")}</span>
                    </td>
                    <td>
                      <StatusTag
                        status={
                          e.severity === "critical"
                            ? "failed"
                            : e.severity === "warning"
                              ? "pending"
                              : "info"
                        }
                        label={e.severity}
                      />
                    </td>
                    <td className="text-xs text-[var(--muted)]">
                      {e.resolution ?? "—"}
                    </td>
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
function Tile({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
  hint?: string;
}) {
  const edge =
    tone === "good"
      ? "stat-good"
      : tone === "warn"
        ? "stat-warn"
        : tone === "bad"
          ? "stat-bad"
          : tone === "accent"
            ? "stat-accent"
            : "";
  const ink =
    tone === "good"
      ? "text-[var(--good)]"
      : tone === "warn"
        ? "text-[var(--warn)]"
        : tone === "bad"
          ? "text-[var(--bad)]"
          : "";
  return (
    <div className={`panel stat ${edge}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value !text-[1.5rem] ${ink}`}>{value}</div>
      {hint && (
        <div className="mt-1 text-[0.72rem] leading-snug text-[var(--faint)]">
          {hint}
        </div>
      )}
    </div>
  );
}
