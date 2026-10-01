export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { loadBlindQueue } from "@/lib/queries";
import BlindQueueTable from "@/components/BlindQueueTable";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "candidate") redirect("/candidate");

  const data = await loadBlindQueue();

  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Assessment analytics</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {user.role === "admin"
            ? "Admin view: candidate identities are visible."
            : "Blind review is active. Candidates appear as pseudonyms until the review phase closes."}
        </p>

        <section className="panel mt-6 p-5">
          <h2 className="text-base font-semibold">Item performance</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Discrimination index: 1.00 means every correct answer came from a
            high-ability item. Items below 0.20 are candidates for retirement.
          </p>
          <table className="table mt-3">
            <thead>
              <tr>
                <th>Question</th>
                <th>Type</th>
                <th>Attempts</th>
                <th>Correct</th>
                <th>Difficulty</th>
                <th>Median time</th>
              </tr>
            </thead>
            <tbody>
              {data.itemStats.map((s) => (
                <tr key={s.questionId}>
                  <td className="font-mono text-xs">{s.questionId}</td>
                  <td>{s.type.replace("_", " ")}</td>
                  <td>{s.attempts}</td>
                  <td className="tabular-nums">
                    {s.correctRate !== null ? `${s.correctRate}%` : "—"}
                  </td>
                  <td className="tabular-nums">
                    {s.correctRate !== null ? s.correctRate : "—"}
                  </td>
                  <td className="tabular-nums">{s.medianTimeLabel}</td>
                </tr>
              ))}
              {data.itemStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-[var(--muted)]">
                    No graded items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel mt-4 p-5">
          <h2 className="text-base font-semibold">Submitted attempts</h2>
          <BlindQueueTable
            rows={data.queue}
            showIdentity={user.role === "admin"}
            blindReview={data.blindReviewActive}
          />
        </section>
      </div>
    </main>
  );
}