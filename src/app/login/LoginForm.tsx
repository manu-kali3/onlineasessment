"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const justReset = params.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    justReset ? "Password updated. Sign in with your new password." : null,
  );
  const [busy, setBusy] = useState(false);

  // Set when sign-in is refused because the address is unverified, which is
  // exactly when offering a fresh link is useful.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  async function resendVerification() {
    if (!unverifiedEmail || resending) return;
    setResending(true);
    setResendNote(null);
    setResendStatus(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendNote(data.error ?? "Could not send the link");
        return;
      }
      setResendNote(data.message);
      setResendStatus(data.status ?? null);
    } catch {
      setResendNote("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setUnverifiedEmail(null);
    setResendNote(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign in failed");
        if (data.needsVerification && data.email) {
          setUnverifiedEmail(data.email);
        }
        return;
      }
      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="panel w-full p-6 shadow-[var(--shadow-lg)] sm:p-7"
      noValidate
    >
      <h1 className="page-title !text-[1.6rem]">Sign in</h1>
      <p className="page-sub !mt-1.5">
        Enter the email address your invitation was sent to.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      {notice && (
        <div role="status" className="banner banner-good mt-4">
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="banner banner-bad mt-4">
          <span aria-hidden="true" className="mt-0.5 shrink-0">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 8v5M12 16.5h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <span className="font-medium">{error}</span>
        </div>
      )}

      {unverifiedEmail && (
        <div className="panel panel-2 panel-flat mt-4 border border-[var(--line)] p-4">
          <p className="text-sm font-semibold">Still waiting on your email?</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Verification links expire after 60 minutes and are single-use.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3 w-full !py-2"
            onClick={() => void resendVerification()}
            disabled={resending}
          >
            {resending ? "Sending…" : "Resend verification link"}
          </button>
          {resendNote && (
            <p
              role="status"
              className={`mt-2 text-xs ${
                resendStatus === "sent" ? "text-[var(--good)]" : "text-[var(--muted)]"
              }`}
            >
              {resendNote}
            </p>
          )}
        </div>
      )}

      <button className="btn btn-primary btn-lg mt-6 w-full" disabled={busy}>
        {busy ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <Link
          href="/forgot-password"
          className="text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          Forgot password?
        </Link>
        <Link href="/register" className="link">
          Create an account
        </Link>
      </div>
    </form>
  );
}