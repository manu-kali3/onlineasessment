"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send the reset link");
        setBusy(false);
        return;
      }
      setMessage(data.message);
      setDevUrl(data.devResetUrl);
      setBusy(false);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel w-full max-w-sm p-6">
      <h1 className="text-xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Enter the email on your account and we will send a link to choose a new
        password.
      </p>

      {message ? (
        <>
          <p role="status" className="mt-4 tag tag-good inline-block">
            {message}
          </p>
          {devUrl && (
            <div className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Email not configured
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                This deployment has no sending key, so the link is shown here
                instead.
              </p>
              <Link href={devUrl} className="btn btn-ghost mt-3 w-full !text-xs">
                Open reset link
              </Link>
            </div>
          )}
          <Link href="/login" className="btn btn-primary mt-5 w-full">
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <div className="mt-5">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 tag tag-bad inline-block">
              {error}
            </p>
          )}

          <button className="btn btn-primary mt-5 w-full" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>

          <p className="mt-5 text-center text-sm text-[var(--muted)]">
            <Link href="/login" className="font-semibold text-[var(--accent)]">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </form>
  );
}