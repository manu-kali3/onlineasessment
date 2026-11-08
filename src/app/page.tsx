import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";
import HomeDashboard from "./HomeDashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Works with or without a database: unauthenticated visitors get the landing
  // page, signed-in users get their dashboard.
  const user = await getCurrentUser().catch(() => null);

  if (user) {
    return <HomeDashboard name={user.fullName} role={user.role} />;
  }

  if (!hasDatabase) {
    return <SetupNotice />;
  }

  return <Landing />;
}

const FEATURES = [
  {
    title: "Guided test delivery",
    body: "Timed modules, autosave, and a server-locked clock so nothing depends on the candidate's browser.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 1.8" />
      </>
    ),
  },
  {
    title: "Objective + assessor grading",
    body: "Instant scoring for objective items, rubric-based human review for video and written responses.",
    icon: (
      <>
        <path d="M4 5.5h16v11H13l-4 3v-3H4z" />
        <path d="M8.5 9.5h7M8.5 12.5h4" />
      </>
    ),
  },
  {
    title: "Normed benchmarking",
    body: "Every score is percentile-ranked against a norm group so recruiters see relative standing, not just raw marks.",
    icon: (
      <>
        <path d="M4 19.5V13M9.5 19.5V8M15 19.5v-4.5M20.5 19.5V4.5" />
      </>
    ),
  },
  {
    title: "Blind review",
    body: "Assessor views hide name, email, and demographics until the review phase is closed.",
    icon: (
      <>
        <path d="M3 12s3.4-5.5 9-5.5S21 12 21 12s-3.4 5.5-9 5.5S3 12 3 12z" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M4.5 20.5 19.5 3.5" />
      </>
    ),
  },
  {
    title: "Integrity signals",
    body: "Browser lockdown events and webcam AI flags roll up into an integrity score for human adjudication.",
    icon: (
      <>
        <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 7.7 7 9.2 4.1-1.5 7-4.9 7-9.2V6.2z" />
        <path d="M9.2 12.2l2 2 3.6-3.9" />
      </>
    ),
  },
  {
    title: "ATS integration",
    body: "Scores push to Workday, Greenhouse, or Lever through an auditable outbound sync queue.",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="6" height="6" rx="1.4" />
        <rect x="14.5" y="4.5" width="6" height="6" rx="1.4" />
        <rect x="9" y="14" width="6" height="6" rx="1.4" />
        <path d="M6.5 10.5v2.5h11v-2.5M12 13v1" />
      </>
    ),
  },
];

/** Icon wrapper: consistent stroke weight and no per-icon attribute drift. */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      {children}
    </svg>
  );
}

function Landing() {
  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <span className="flex items-center gap-2.5 text-sm font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-[9px] bg-[var(--accent)] text-[13px] font-black text-[var(--accent-ink)] shadow-[var(--shadow-sm)]"
            >
              A
            </span>
            Assessment Center
          </span>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link href="/register" className="link hidden text-sm sm:inline">
              Create account
            </Link>
            <Link href="/login" className="btn btn-primary btn-sm sm:!px-4">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-14 md:pt-24">
        <p className="tag tag-accent tag-dot mb-5">Virtual testing room</p>
        <h1 className="max-w-3xl text-[2.35rem] leading-[1.06] font-bold tracking-[-0.035em] text-balance md:text-[3.6rem]">
          High-stakes evaluation,
          <br className="hidden sm:block" />{" "}
          <span className="text-[var(--accent)]">without a room to book.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--muted)]">
          One platform for the candidate experience and the recruiter back
          office: secure delivery, automated scoring, and the analytics that make
          a hiring decision defensible.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/login" className="btn btn-primary btn-lg">
            Sign in as a candidate
          </Link>
          <Link href="/login" className="btn btn-ghost btn-lg">
            Sign in as a recruiter
          </Link>
        </div>

        {/* Concrete claims beat adjectives: these are the properties the code
            actually enforces, not marketing. */}
        <dl className="mt-12 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 border-t border-[var(--line)] pt-8 sm:grid-cols-4">
          {[
            ["Server-side", "clock & scoring"],
            ["6", "question types"],
            ["0-100", "integrity score"],
            ["Per course", "access & pricing"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="text-[1.35rem] font-bold tracking-tight">
                {value}
              </dt>
              <dd className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
                {label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="section-head mb-5">
          <h2 className="text-lg font-semibold tracking-tight">
            What the platform enforces
          </h2>
          <p className="text-xs text-[var(--faint)]">
            Every claim below is a server-side rule, not a UI overlay.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="panel panel-interactive p-5"
            >
              <span
                aria-hidden="true"
                className="grid h-9 w-9 place-items-center rounded-[10px] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
              >
                <Icon>{f.icon}</Icon>
              </span>
              <h3 className="mt-3.5 text-[0.95rem] font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-[var(--faint)]">
          <span>Assessment Center</span>
          <span className="flex items-center gap-4">
            <Link href="/login" className="hover:text-[var(--ink)]">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-[var(--ink)]">
              Register
            </Link>
          </span>
        </div>
      </footer>
    </main>
  );
}

/** Shown when the app is deployed but the database is not wired up yet. */
function SetupNotice() {
  return (
    <main className="auth-shell">
      <div className="panel w-full max-w-xl p-8 shadow-[var(--shadow-lg)]">
        <span className="tag tag-warn tag-dot">Setup required</span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-balance">
          The interface is live. The database is not connected yet.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          This deployment has no{" "}
          <code className="rounded bg-[var(--bg-deep)] px-1.5 py-0.5 font-semibold">
            DATABASE_URL
          </code>
          , so sign-in and assessments are disabled. Add your Neon Postgres
          connection string to the environment and redeploy.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--panel-2)] p-4 text-xs leading-relaxed">
{`DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`}
        </pre>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Then run{" "}
          <code className="rounded bg-[var(--bg-deep)] px-1.5 py-0.5 font-semibold">
            npm run db:push
          </code>{" "}
          and{" "}
          <code className="rounded bg-[var(--bg-deep)] px-1.5 py-0.5 font-semibold">
            npm run db:seed
          </code>{" "}
          once to create the tables and demo accounts.
        </p>
      </div>
    </main>
  );
}
