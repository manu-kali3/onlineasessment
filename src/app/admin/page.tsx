
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import { loadRecruiterDashboard } from "@/lib/queries";
import StatCard from "@/components/StatCard";
import RiskQueue from "@/components/RiskQueue";

export const dynamic = "force-dynamic";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];
export default async function AdminPage() {
  const user = await requirePageUser("recruiter", "assessor", "admin");
  const data = await loadRecruiterDashboard(user.role);
  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Recruiter overview</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Live pipeline across{" "}
          {data.counts.published} published assessments
          {data.normGroup ? ` · normed against ${data.normGroup}` : ""}.
        </p>
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Published tests" value={data.counts.published} />
          <StatCard label="In progress" value={data.counts.inProgress} />
          <StatCard label="Awaiting review" value={data.counts.awaitingReview} />
          <StatCard label="Flagged" value={data.counts.flagged} tone="bad" />
          <StatCard
            label="Avg score"
            value={data.averageScore !== null ? `${data.averageScore}%` : "—"}
          />
        </section>
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <section className="panel p-5 lg:col-span-3">
            <h2 className="text-base font-semibold">Assessment performance</h2>
            <table className="table mt-3">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Completed</th>
                  <th>Avg</th>
                  <th>Pass rate</th>
                </tr>
              </thead>
              <tbody>
                {data.topAssessments.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.title}</td>
                    <td>{a.completed}</td>
                    <td>{a.avgScore !== null ? `${a.avgScore}%` : "—"}</td>
                    <td>
                      {a.passRate !== null ? (
                        <span
                          className={`tag ${a.passRate >= 60 ? "tag-good" : "tag-warn"}`}
                        >
                          {a.passRate}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {data.topAssessments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-[var(--muted)]">
                      No assessments yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="panel p-5 lg:col-span-2">
            <h2 className="text-base font-semibold">Integrity risk queue</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Low integrity scores route to human adjudication. They are never an
              automatic fail.
            </p>
            <RiskQueue items={data.riskQueue} />
          </section>
        </div>
        <section className="panel mt-4 p-5">
          <h2 className="text-base font-semibold">Recent attempts</h2>
          <table className="table mt-3">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Assessment</th>
                <th>Status</th>
                <th>Score</th>
                <th>Percentile</th>
                <th>Integrity</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAttempts.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.candidateName}</td>
                  <td>{a.assessmentTitle}</td>
                  <td>
                    <span
                      className={`tag ${
                        a.status === "graded"
                          ? "tag-good"
                          : a.status === "submitted"
                            ? "tag-warn"
                            : ""
                      }`}
                    >
                      {a.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="tabular-nums">
                    {a.score !== null ? `${a.score}%` : "—"}
                  </td>
                  <td className="tabular-nums">
                    {a.percentile !== null ? a.percentile : "—"}
                  </td>
                  <td className="tabular-nums">
                    {a.integrityScore !== null ? a.integrityScore : "—"}
                  </td>
                </tr>
              ))}
              {data.recentAttempts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-[var(--muted)]">
                    No attempts recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
