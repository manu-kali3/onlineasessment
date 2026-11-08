
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase, canSendEmail } from "@/lib/env";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!hasDatabase) {
    // Without a database there are no credentials to check against, so send
    // the visitor to the setup notice on the home page instead of failing.
    redirect("/");
  }

  const user = await getCurrentUser();
  if (user) redirect(user.role === "candidate" ? "/candidate" : "/admin");

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/*
        Left panel is decorative and hidden below lg, so a phone gets the form
        immediately rather than scrolling past marketing to reach it.
      */}
      <aside className="relative hidden overflow-hidden border-r border-[var(--line)] bg-[var(--panel)] p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(600px 400px at 15% 10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%), radial-gradient(520px 380px at 90% 85%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)",
          }}
        />
        <Link
          href="/"
          className="relative flex items-center gap-2.5 text-sm font-bold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-[9px] bg-[var(--accent)] text-[13px] font-black text-[var(--accent-ink)] shadow-[var(--shadow-sm)]"
          >
            A
          </span>
          Assessment Center
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-[2rem] leading-[1.15] font-bold tracking-[-0.03em] text-balance">
            A testing room that cannot be argued with.
          </h2>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-[var(--muted)]">
            The clock, the scoring, and the access check all run on the server.
            Candidates get a fair attempt; recruiters get evidence they can
            defend.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              "Server-locked timer — refreshing buys no time",
              "Blind review strips identity from assessor views",
              "Integrity signals flag for a human, never auto-fail",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
                  </svg>
                </span>
                <span className="leading-relaxed text-[var(--muted)]">
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[var(--faint)]">
          Candidate accounts only. Recruiter and assessor access is granted by an
          administrator.
        </p>
      </aside>

      <div className="auth-shell lg:!min-h-0">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-6 flex items-center gap-2.5 text-sm font-bold tracking-tight lg:hidden"
          >
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-[9px] bg-[var(--accent)] text-[13px] font-black text-[var(--accent-ink)] shadow-[var(--shadow-sm)]"
            >
              A
            </span>
            Assessment Center
          </Link>

          {/*
            Without a sending key every verification and reset email is logged
            instead of sent, so candidates are told to check an inbox that will
            never receive anything. Say so on the page where they would hit it.
          */}
          {!canSendEmail && (
            <div className="banner banner-warn mb-4" role="status">
              <span aria-hidden="true" className="mt-0.5 text-[var(--warn)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M12 8.5v5M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </span>
              <p>
                <span className="font-semibold">Email not configured.</span>{" "}
                Verification and password reset emails are not actually sent —
                set <code className="font-semibold">RESEND_API_KEY</code> in the
                environment to restore them.
              </p>
            </div>
          )}

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
