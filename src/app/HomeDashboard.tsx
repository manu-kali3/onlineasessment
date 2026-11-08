import Link from "next/link";
import { TopBar } from "@/components/TopBar";

/**
 * Post-login landing. Links to the real role dashboards.
 *
 * Each tile is one destination with a one-line purpose — the card is a link, so
 * the whole surface is the target, and the arrow is a visual affordance only
 * (aria-hidden, because the link text already says where it goes).
 */
export default function HomeDashboard({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const isCandidate = role === "candidate";

  const tiles = isCandidate
    ? [
        {
          href: "/candidate",
          title: "My assessments",
          body: "Start, resume, or review an assessment you have been invited to.",
        },
        {
          href: "/candidate/courses",
          title: "Browse courses",
          body: "Every published course, with price and whether you can start today.",
        },
      ]
    : [
        {
          href: "/admin",
          title: "Recruiter overview",
          body: "Counts, pass rates, and the integrity risk queue.",
        },
        {
          href: "/admin/assessments",
          title: "Test authoring",
          body: "Build assessments from the validated question bank.",
        },
        {
          href: "/admin/analytics",
          title: "Analytics",
          body: "Item difficulty, time on task, and the blind review queue.",
        },
      ];

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

      <div className="shell">
        <h1 className="page-title">Welcome back, {name.split(" ")[0]}</h1>
        <p className="page-sub">
          {isCandidate
            ? "Your assessments, deadlines, and results are all in one place."
            : "Pipeline health, review queue, and proctoring signals."}
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="panel panel-interactive group flex flex-col p-5"
            >
              <h2 className="flex items-start justify-between gap-3 text-[0.98rem] font-semibold tracking-tight">
                {t.title}
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-[var(--faint)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h13M13 6.5l5.5 5.5L13 17.5" />
                  </svg>
                </span>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {t.body}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
