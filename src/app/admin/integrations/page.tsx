

import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import { db } from "@/db";
import { integrations, syncLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { TableWrap } from "@/components/TableWrap";

export const dynamic = "force-dynamic";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];
export default async function IntegrationsPage() {
  const user = await requirePageUser("admin");
  const rows = await db.select().from(integrations);
  const logs = await db
    .select()
    .from(syncLogs)
    .orderBy(desc(syncLogs.createdAt))
    .limit(15);
  const nameByIntegration = new Map(rows.map((r) => [r.id, r.name]));
  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">ATS integrations</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          When a candidate finishes an assessment, the result is pushed to the ATS
          so it lands on their profile without manual re-entry.
        </p>
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map((i) => (
            <article key={i.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold capitalize">{i.provider}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{i.name}</p>
                  {i.baseUrl && (
                    <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                      {i.baseUrl}
                    </p>
                  )}
                </div>
                <span className={`tag ${i.active ? "tag-good" : ""}`}>
                  {i.active ? "Active" : "Paused"}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="btn btn-ghost !py-1 !px-2 !text-xs">
                  {i.active ? "Pause" : "Activate"}
                </button>
                <button className="btn btn-ghost !py-1 !px-2 !text-xs">
                  Test connection
                </button>
              </div>
            </article>
          ))}
        </section>
        <section className="panel mt-6 p-5">
          <h2 className="text-base font-semibold">Sync log</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Outbound pushes retry with backoff. Failed rows stay here until an admin
            requeues them.
          </p>
          <TableWrap className="mt-3">

              <table className="table">
                <thead>
              <tr>
                <th>When</th>
                <th>Integration</th>
                <th>Direction</th>
                <th>Event</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="tabular-nums text-xs">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td>{nameByIntegration.get(l.integrationId) ?? "—"}</td>
                  <td>{l.direction}</td>
                  <td className="font-mono text-xs">{l.event}</td>
                  <td>
                    <span
                      className={`tag ${
                        l.status === "success"
                          ? "tag-good"
                          : l.status === "failed"
                            ? "tag-bad"
                            : "tag-warn"
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-[var(--muted)]">
                    No sync activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          </TableWrap>
        </section>
      </div>
    </main>
  );
}
