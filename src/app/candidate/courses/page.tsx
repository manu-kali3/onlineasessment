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

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Available courses</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Every published course. Free ones start straight away; paid ones ask for
          payment before you begin.
        </p>

        <div className="mt-5">
          <AccessibilityControls />
        </div>

        {courses.length === 0 && (
          <p className="mt-6 rounded-md border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted)]">
            No courses are published yet.
          </p>
        )}

        <section className="mt-6 grid gap-4">
          {courses.map((c) => {
            const total = c.priceMinor + c.vatMinor;
            const closed =
              c.attemptStatus === "submitted" || c.attemptStatus === "graded";

            return (
              <article key={c.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{c.title}</h2>
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
