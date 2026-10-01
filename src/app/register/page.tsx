"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [done, setDone] = useState<{ message: string; devUrl?: string } | null>(
    null,
  );
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  async function resendVerification() {
    setResending(true);
    setResendNote(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendNote(data.error ?? "Could not send the link");
        return;
      }
      setResendNote(data.message);
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
    setFeedback([]);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create the account");
        setFeedback(data.feedback ?? []);
        setBusy(false);
        return;
      }
      setDone({ message: data.message, devUrl: data.devVerifyUrl });
      setBusy(false);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="panel w-full max-w-md p-6">
          <span className="tag tag-good">Almost there</span>
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{done.message}</p>

          {done.devUrl && (
            <div className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Email not configured
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                This deployment has no sending key, so the link is shown here
                instead.
              </p>
              <a
                href={done.devUrl}
                className="btn btn-ghost mt-3 w-full !text-xs"
              >
                Open verification link
              </a>
            </div>
          )}

          <button
            type="button"
            className="btn btn-ghost mt-3 w-full"
            onClick={() => void resendVerification()}
            disabled={resending}
          >
            {resending ? "Sending…" : "Resend verification link"}
          </button>
          {resendNote && (
            <p role="status" className="mt-2 text-xs text-[var(--muted)]">
              {resendNote}
            </p>
          )}

          <Link href="/login" className="btn btn-primary mt-5 w-full">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6">
        <h1 className="text-xl font-bold tracking-tight">Create an account</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Candidate accounts. Recruiter and assessor access is granted by an
          administrator.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              className="input"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
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
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              At least 12 characters. A passphrase of several words works well.
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 tag tag-bad inline-block">
            {error}
          </p>
        )}
        {feedback.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
            {feedback.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}

        <button className="btn btn-primary mt-5 w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)]">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}