
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import { loadBlindQueue } from "@/lib/queries";
import BlindQueueTable from "@/components/BlindQueueTable";
import { TableWrap } from "@/components/TableWrap";
import { adminNav } from "@/lib/admin-nav";
import { EmptyRow, PanelHead, PercentBar, Tag } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requirePageUser("recruiter", "assessor", "admin");
  const data = await loadBlindQueue(user.role);
  const isAdmin = user.role === "admin";

  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="shell">
        <div className="section-head">
          <div>
            <h1 className="page-title">Assessment analytics</h1>
            <p className="page-sub">
              Item difficulty, time on task, and the queue of attempts waiting
              for an assessor.
            </p>
          </div>
          {isAdmin ? (
            <Tag tone="accent">Admin view · identities visible</Tag>
          ) : (
            <Tag tone="good">Blind review on</Tag>
          )}
        </div>

        <section className="panel mt-6 p-5">
          <PanelHead
            title="Item performance"
            count={data.itemStats.length}
            hint="Correct rate is the item's observed difficulty. A very high rate means it does not discriminate between candidates; a very low one may be miskeyed or unfairly hard. Median time is the typical time on task across all attempts of the item."
          />
          <TableWrap className="mt-3" label="Item performance">
            <table className="table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Type</th>
                  <th className="num">Attempts</th>
                  <th>Correct rate</th>
                  <th className="num">Median time</th>
                </tr>
              </thead>
              <tbody>
                {data.itemStats.map((s) => (
                  <tr key={s.questionId}>
                    <td>
                      <span className="code">{s.questionId}</span>
                    </td>
                    <td>
                      <span className="text-xs text-[var(--muted)] capitalize">
                        {s.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="num text-[var(--muted)]">{s.attempts}</td>
                    <td>
                      {/*
                        Tone is derived from the analytics meaning rather than a
                        raw threshold: neither extreme is healthy, so a mid-band
                        rate reads as good and the two tails are flagged.
                      */}
                      <PercentBar
                        value={s.correctRate}
                        tone={
                          s.correctRate === null
                            ? undefined
                            : s.correctRate > 92
                              ? "warn"
                              : s.correctRate < 25
                                ? "bad"
                                : "good"
                        }
                      />
                    </td>
                    <td className="num tabular-nums">{s.medianTimeLabel}</td>
                  </tr>
                ))}
                {data.itemStats.length === 0 && (
                  <EmptyRow colSpan={5}>
                    No graded items yet — item statistics appear once attempts
                    are scored.
                  </EmptyRow>
                )}
              </tbody>
            </table>
          </TableWrap>
        </section>

        <section className="panel mt-4 p-5">
          <PanelHead
            title="Submitted attempts"
            count={data.queue.length}
            hint="Open an attempt for the per-question breakdown and the full proctoring timeline."
          />
          <BlindQueueTable
            rows={data.queue}
            showIdentity={isAdmin}
            blindReview={data.blindReviewActive}
          />
        </section>
      </div>
    </main>
  );
}
