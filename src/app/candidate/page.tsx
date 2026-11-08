
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
      return <span className="tag tag-good tag-dot">{status}</span>;
    case "in_progress":
      return <span className="tag tag-warn tag-dot">In progress</span>;
    case "expired":
      return <span className="tag tag-bad tag-dot">Expired</span>;
    default:
      return <span className="tag tag-dot">Not started</span>;
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
      <main className="shell">
        <h1 className="page-title">Your assessments</h1>
        <p className="page-sub">
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
            <div className="empty">
              <span aria-hidden="true" className="text-[var(--faint)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="5" width="17" height="14" rx="2" />
                  <path d="M3.5 9.5h17M8 13h8M8 16h5" />
                </svg>
              </span>
              <span>
                No assessments have been assigned to you yet — browse the{" "}
                <Link href="/candidate/courses" className="link">
                  course catalog
                </Link>{" "}
                to enrol in one.
              </span>
            </div>
          )}
          {invitations.map((inv) => {
            const expired = inv.expiresAt.getTime() < Date.now();
            const closed = inv.status === "submitted" || inv.status === "graded";
            return (
              <article key={inv.id} className="panel p-5 transition-shadow hover:shadow-[var(--shadow-md)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[1.05rem] font-semibold tracking-tight">
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
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span aria-hidden="true" className="text-[var(--faint)]">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <rect x="3.5" y="5" width="17" height="15" rx="2" />
                            <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
                          </svg>
                        </span>
                        Due {fmtDeadline(inv.expiresAt)}
                      </span>
                      {statusTag(inv.status)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {inv.score !== null && (
                      <div className="text-right">
                        <div className="text-[1.6rem] leading-none font-bold tabular-nums tracking-tight">
                          {inv.score}%
                        </div>
                        <div className="mt-1 text-[0.7rem] text-[var(--muted)]">
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
