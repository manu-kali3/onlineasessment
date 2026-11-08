
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import { db } from "@/db";
import { integrations, syncLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { TableWrap } from "@/components/TableWrap";
import { adminNav } from "@/lib/admin-nav";
import { EmptyRow, EmptyState, PanelHead, StatusTag, Tag } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requirePageUser("admin");
  const rows = await db.select().from(integrations);
  const logs = await db
    .select()
    .from(syncLogs)
    .orderBy(desc(syncLogs.createdAt))
    .limit(15);
  const nameByIntegration = new Map(rows.map((r) => [r.id, r.name]));
  const failed = logs.filter((l) => l.status === "failed").length;

  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />
      <div className="shell">
        <div className="section-head">
          <div>
            <h1 className="page-title">ATS integrations</h1>
            <p className="page-sub">
              When a candidate finishes an assessment, the result is pushed to
              the ATS so it lands on their profile without manual re-entry.
            </p>
          </div>
          <Tag tone="accent">Admin only</Tag>
        </div>

        {rows.length === 0 ? (
          <div className="mt-6">
            <EmptyState>
              No ATS connections configured. The schema is in place — the worker
              that drains this queue is not built yet.
            </EmptyState>
          </div>
        ) : (
          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            {rows.map((i) => (
              <article key={i.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[0.98rem] font-semibold tracking-tight capitalize">
                      {i.provider}
                    </h2>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {i.name}
                    </p>
                  </div>
                  <StatusTag
                    status={i.active ? "active" : "draft"}
                    label={i.active ? "Active" : "Paused"}
                  />
                </div>

                {i.baseUrl && (
                  <div className="mt-3">
                    <span className="code">{i.baseUrl}</span>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    // No handler yet: the integration worker is not built. The
                    // control is present so the intended shape is visible, and
                    // disabled so it cannot look like a silent no-op.
                    disabled
                    title="Not wired up yet"
                  >
                    {i.active ? "Pause" : "Activate"}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled>
                    Test connection
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="panel mt-4 p-5">
          <PanelHead
            title="Sync log"
            count={logs.length}
            hint="Outbound pushes retry with backoff. Failed rows stay here until an admin requeues them."
            action={
              failed > 0 ? (
                <Tag tone="bad">{failed} failed</Tag>
              ) : (
                <Tag tone="good">No failures</Tag>
              )
            }
          />
          <TableWrap className="mt-3" label="Sync log">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Integration</th>
                  <th>Direction</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="text-xs tabular-nums text-[var(--muted)]">
                      {new Date(l.createdAt).toLocaleString("en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="text-[var(--muted)]">
                      {nameByIntegration.get(l.integrationId) ?? "—"}
                    </td>
                    <td>
                      <span className="text-xs text-[var(--muted)] capitalize">
                        {l.direction}
                      </span>
                    </td>
                    <td>
                      <span className="code">{l.event}</span>
                    </td>
                    <td>
                      <StatusTag status={l.status} />
                    </td>
                    <td className="text-right">
                      {l.status === "failed" && (
                        <button
                          className="btn btn-quiet btn-sm"
                          disabled
                          title="Requeue is part of the unbuilt worker"
                        >
                          Requeue
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <EmptyRow colSpan={6}>
                    No sync activity yet. Pushes appear here once an integration
                    is active.
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
