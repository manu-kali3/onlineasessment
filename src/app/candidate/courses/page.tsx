export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePageUser } from "@/lib/page-auth";
import { loadCourseCatalog } from "@/lib/queries";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import { AccessibilityControls } from "@/components/AccessibilityControls";
import { TopBar } from "@/components/TopBar";
import EnrolButton from "@/components/EnrolButton";
import { formatKes } from "@/lib/pricing";

export default async function CourseCatalogPage() {
  const user = await requirePageUser("candidate");
  const courses = await loadCourseCatalog(user.id);
  const a11y = user.accessibilityProfile ?? {};

  return (
    <AccessibilityProvider initial={a11y}>
      <TopBar
        name={user.fullName}
        role={user.role}
        nav={[
          { href: "/candidate", label: "My assessments" },
          { href: "/candidate/courses", label: "Browse courses" },
        ]}
      />

      <main className="shell">
        <h1 className="page-title">Available courses</h1>
        <p className="page-sub">
          Every published course. Free ones start straight away; paid ones ask for
          payment before you begin.
        </p>

        <div className="mt-5">
          <AccessibilityControls />
        </div>

        {courses.length === 0 && (
          <div className="empty mt-6">
            <span aria-hidden="true" className="text-[var(--faint)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6.5A2 2 0 0 1 6 4.5h5v15H6a2 2 0 0 1-2-2z" />
                <path d="M20 6.5a2 2 0 0 0-2-2h-5v15h5a2 2 0 0 0 2-2z" />
              </svg>
            </span>
            <span>No courses are published yet. Check back shortly.</span>
          </div>
        )}

        <section className="mt-6 grid gap-4">
          {courses.map((c) => {
            const total = c.priceMinor + c.vatMinor;
            const closed =
              c.attemptStatus === "submitted" || c.attemptStatus === "graded";

            return (
              <article
                key={c.id}
                className="panel p-5 transition-shadow hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[1.05rem] font-semibold tracking-tight">
                      {c.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                      {c.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="tag">{c.durationMin} min</span>
                      <span className="tag">{c.delivery}</span>
                      {c.requireProctoring && (
                        <span className="tag tag-warn">Proctored</span>
                      )}
                      {c.priceMinor === 0 ? (
                        <span className="tag tag-good">Free</span>
                      ) : (
                        <span className="tag tag-warn">
                          {formatKes(total)}
                          <span className="ml-1 font-normal opacity-80">
                            ({formatKes(c.priceMinor)} + {formatKes(c.vatMinor)} VAT)
                          </span>
                        </span>
                      )}
                      {c.enrolled && (
                        <span className="tag">
                          {c.attemptStatus
                            ? c.attemptStatus.replace("_", " ")
                            : "Enrolled"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {c.score !== null && (
                      <div className="text-right">
                        <div className="text-2xl font-bold">{c.score}%</div>
                        <div className="text-xs text-[var(--muted)]">
                          {c.percentile !== null ? `${c.percentile}th percentile` : "Score"}
                        </div>
                      </div>
                    )}

                    {closed && c.attemptId ? (
                      <Link
                        href={`/candidate/results/${c.attemptId}`}
                        className="btn btn-ghost"
                      >
                        View result
                      </Link>
                    ) : c.invitationId ? (
                      // Already enrolled: the invitation exists, so go straight
                      // to the pre-flight screen.
                      <Link
                        href={`/candidate/assessment/${c.invitationId}`}
                        className="btn btn-primary"
                      >
                        {c.attemptId ? "Resume" : "Start"}
                      </Link>
                    ) : c.accessible ? (
                      // Free, or already unlocked, but never enrolled: enrolling
                      // is what creates the invitation.
                      <EnrolButton assessmentId={c.id} priceMinor={c.priceMinor} />
                    ) : (
                      // Paid and locked. Enrolling redirects to checkout rather
                      // than writing a row, so no EnrolButton here.
                      <Link
                        href={`/paywall?course=${c.id}`}
                        className="btn btn-primary"
                      >
                        Enrol · {formatKes(c.priceMinor + c.vatMinor)}
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
