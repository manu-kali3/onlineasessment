
import Link from "next/link";
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import { loadRecruiterDashboard } from "@/lib/queries";
import StatCard from "@/components/StatCard";
import RiskQueue from "@/components/RiskQueue";
import { TableWrap } from "@/components/TableWrap";
import { adminNav } from "@/lib/admin-nav";
import {
  EmptyRow,
  IdentityCell,
  PanelHead,
  PercentBar,
  StatusTag,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requirePageUser("recruiter", "assessor", "admin");
  const data = await loadRecruiterDashboard(user.role);
  const isAdmin = user.role === "admin";

  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="shell">
        <div className="section-head">
          <div>
            <h1 className="page-title">Recruiter overview</h1>
            <p className="page-sub">
              Live pipeline across {data.counts.published} published assessment
              {data.counts.published === 1 ? "" : "s"}
              {data.normGroup ? ` · normed against ${data.normGroup}` : ""}.
            </p>
          </div>
          <Link href="/admin/analytics" className="btn btn-ghost btn-sm">
            Open analytics →
          </Link>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Published tests"
            value={data.counts.published}
            hint="live and accepting attempts"
          />
          <StatCard
            label="In progress"
            value={data.counts.inProgress}
            hint="attempts under way now"
          />
          <StatCard
            label="Awaiting review"
            value={data.counts.awaitingReview}
            tone={data.counts.awaitingReview > 0 ? "accent" : "neutral"}
            hint="subjective items to grade"
          />
          <StatCard
            label="Flagged"
            value={data.counts.flagged}
            tone={data.counts.flagged > 0 ? "bad" : "good"}
            hint={data.counts.flagged > 0 ? "integrity below 90" : "all clear"}
          />
          <StatCard
            label="Avg score"
            value={data.averageScore !== null ? `${data.averageScore}%` : "—"}
            hint="graded attempts only"
          />
        </section>

        <div className="split split-3-2 mt-4">
          <section className="panel p-5">
            <PanelHead
              title="Assessment performance"
              hint="Pass rate is colour-coded against a 60% line; a low rate on a full cohort usually means the item set is too hard, not that the candidates were weak."
            />
            <TableWrap className="mt-3" label="Assessment performance">
              <table className="table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th className="num">Completed</th>
                    <th>Avg score</th>
                    <th>Pass rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topAssessments.map((a) => (
                    <tr key={a.id}>
                      <td className="font-medium">{a.title}</td>
                      <td className="num text-[var(--muted)]">{a.completed}</td>
                      <td>
                        <PercentBar
                          value={a.avgScore}
                          tone="accent"
                        />
                      </td>
                      <td>
                        {a.passRate !== null ? (
                          <PercentBar value={a.passRate} warnAt={60} goodAt={60} />
                        ) : (
                          <span className="text-[var(--faint)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.topAssessments.length === 0 && (
                    <EmptyRow colSpan={4}>
                      No assessments yet. Create one from{" "}
                      <Link href="/admin/assessments" className="link">
                        Assessments
                      </Link>
                      .
                    </EmptyRow>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </section>

          <section className="panel p-5">
            <PanelHead
              title="Integrity risk queue"
              count={data.riskQueue.length}
              hint="Low integrity scores route to a human. They are never an automatic fail."
              action={
                <span className="tag tag-warn tag-dot">needs adjudication</span>
              }
            />
            <RiskQueue items={data.riskQueue} />
          </section>
        </div>

        <section className="panel mt-4 p-5">
          <PanelHead
            title="Recent attempts"
            hint={
              isAdmin
                ? "Identities are visible because you are signed in as an administrator."
                : "Blind review is active — candidates appear as stable pseudonyms."
            }
            action={
              <Link href="/admin/analytics" className="btn btn-quiet btn-sm">
                All attempts →
              </Link>
            }
          />
          <TableWrap className="mt-3" label="Recent attempts">
            <table className="table">
              <thead>
                <tr>
                  <th>{isAdmin ? "Candidate" : "Reference"}</th>
                  <th>Assessment</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th className="num">Percentile</th>
                  <th className="num">Integrity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.recentAttempts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <IdentityCell
                        name={a.candidateName}
                        pseudo={a.candidateName}
                        showIdentity={isAdmin}
                      />
                    </td>
                    <td className="text-[var(--muted)]">{a.assessmentTitle}</td>
                    <td>
                      <StatusTag status={a.status} />
                    </td>
                    <td>
                      <PercentBar value={a.score} tone="accent" />
                    </td>
                    <td className="num text-[var(--muted)]">
                      {a.percentile !== null ? a.percentile : "—"}
                    </td>
                    <td className="num">
                      {a.integrityScore !== null ? (
                        <span
                          className={
                            a.integrityScore < 90
                              ? "font-semibold text-[var(--bad)]"
                              : "text-[var(--muted)]"
                          }
                        >
                          {a.integrityScore}
                        </span>
                      ) : (
                        <span className="text-[var(--faint)]">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/admin/attempts/${a.id}`}
                        className="btn btn-quiet btn-sm"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.recentAttempts.length === 0 && (
                  <EmptyRow colSpan={7}>
                    No attempts recorded yet. They appear here as candidates
                    start.
                  </EmptyRow>
                )}
              </tbody>
            </table>
          </TableWrap>
        </section>
      </div>
    </main>
  );
}
