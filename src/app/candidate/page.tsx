
import Link from "next/link";
import { requirePageUser } from "@/lib/page-auth";
import { loadCandidateInvitations } from "@/lib/queries";
import { formatKes } from "@/lib/pricing";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import { AccessibilityControls } from "@/components/AccessibilityControls";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

function statusTag(status: string) {
  switch (status) {
    case "submitted":
    case "graded":
      return <span className="tag tag-good">{status}</span>;
    case "in_progress":
      return <span className="tag tag-warn">In progress</span>;
    case "expired":
      return <span className="tag tag-bad">Expired</span>;
    default:
      return <span className="tag">Not started</span>;
  }
}
function fmtDeadline(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
export default async function CandidateDashboard() {
  const user = await requirePageUser("candidate");
  const invitations = await loadCandidateInvitations(user.id);
  const a11y = user.accessibilityProfile ?? {};
  return (
    <AccessibilityProvider initial={a11y}>
      <TopBar name={user.fullName} role={user.role} nav={[
          { href: "/candidate", label: "My assessments" },
          { href: "/candidate/courses", label: "Browse courses" },
        ]} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Your assessments</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Hi {user.fullName.split(" ")[0]}. Each assessment has its own deadline and
          timer. Your progress saves automatically.
        </p>

        <div className="mt-4">
          <Link
            href="/candidate/courses"
            className="btn btn-ghost w-full justify-center sm:w-auto"
          >
            Browse all available courses →
          </Link>
        </div>
        <div className="mt-5">
          <AccessibilityControls />
        </div>
        <section className="mt-6 grid gap-4">
          {invitations.length === 0 && (
            <div className="panel p-6 text-sm text-[var(--muted)]">
              No assessments have been assigned to you yet.
            </div>
          )}
          {invitations.map((inv) => {
            const expired = inv.expiresAt.getTime() < Date.now();
            const closed = inv.status === "submitted" || inv.status === "graded";
            return (
              <article key={inv.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">
                      {inv.assessment.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                      {inv.assessment.description}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span className="tag">{inv.assessment.durationMin} min</span>
                      {inv.assessment.priceMinor > 0 ? (
                        <span className="tag tag-warn">
                          {formatKes(
                            inv.assessment.priceMinor +
                              (inv.assessment.vatMinor ?? 0),
                          )}
                        </span>
                      ) : (
                        <span className="tag tag-good">Free</span>
                      )}
                      {inv.assessment.requireProctoring && (
                        <span className="tag tag-warn">Proctored</span>
                      )}
                      <span>
                        Due {fmtDeadline(inv.expiresAt)}
                      </span>
                      {statusTag(inv.status)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {inv.score !== null && (
                      <div className="text-right">
                        <div className="text-2xl font-bold">{inv.score}%</div>
                        <div className="text-xs text-[var(--muted)]">
                          {inv.percentile !== null
                            ? `${inv.percentile}th percentile`
                            : "Score"}
                        </div>
                      </div>
                    )}
                    {closed ? (
                      <Link
                        href={`/candidate/results/${inv.attemptId}`}
                        className="btn btn-ghost"
                      >
                        View result
                      </Link>
                    ) : expired ? (
                      <span className="btn btn-ghost" aria-disabled>
                        Expired
                      </span>
                    ) : inv.assessment.priceMinor > 0 ? (
                      // Paid course: the runner gates on access, so send them to
                      // the per-course checkout rather than a dead end.
                      <Link
                        href={`/paywall?course=${inv.assessment.id}`}
                        className="btn btn-primary"
                      >
                        {inv.attemptId ? "Resume" : "Pay to start"}
                      </Link>
                    ) : (
                      <Link
                        href={`/candidate/assessment/${inv.id}`}
                        className="btn btn-primary"
                      >
                        {inv.attemptId ? "Resume" : "Start"}
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </AccessibilityProvider>
  );
}
