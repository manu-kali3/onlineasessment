import Link from "next/link";
import { TopBar } from "@/components/TopBar";

/** Post-login landing. Links to the real role dashboards. */
export default function HomeDashboard({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const isCandidate = role === "candidate";

  return (
    <main className="min-h-dvh">
      <TopBar
        name={name}
        role={role}
        nav={
          isCandidate
            ? [{ href: "/candidate", label: "My assessments" }]
            : [
                { href: "/admin", label: "Overview" },
                { href: "/admin/assessments", label: "Assessments" },
                { href: "/admin/analytics", label: "Analytics" },
              ]
        }
      />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {isCandidate
            ? "Your assessments, deadlines, and results are all in one place."
            : "Pipeline health, review queue, and proctoring signals."}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isCandidate ? (
            <>
              <Link href="/candidate" className="panel p-5 hover:border-[var(--accent)]">
                <h2 className="text-base font-semibold">My assessments</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Start, resume, or review an assessment you have been invited to.
                </p>
              </Link>
            </>
          ) : (
            <>
              <Link href="/admin" className="panel p-5 hover:border-[var(--accent)]">
                <h2 className="text-base font-semibold">Recruiter overview</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Counts, pass rates, and the integrity risk queue.
                </p>
              </Link>
              <Link
                href="/admin/assessments"
                className="panel p-5 hover:border-[var(--accent)]"
              >
                <h2 className="text-base font-semibold">Test authoring</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Build assessments from the validated question bank.
                </p>
              </Link>
              <Link
                href="/admin/analytics"
                className="panel p-5 hover:border-[var(--accent)]"
              >
                <h2 className="text-base font-semibold">Analytics</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Item difficulty, time on task, and the blind review queue.
                </p>
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}