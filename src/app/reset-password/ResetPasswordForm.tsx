"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const MIN_LENGTH = 12;

const LABELS = ["Weak", "Weak", "Fair", "Good", "Strong"];

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => {
    if (password.length === 0) return 0;
    if ([...password].length < MIN_LENGTH) return 0;
    let s = 2;
    if ([...password].length >= 16) s = 3;
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
      re.test(password),
    ).length;
    if (classes >= 3) s = Math.min(4, s + 1);
    const lowered = password.toLowerCase();
    if (
      ["password", "qwerty", "letmein", "welcome", "123456"].some((w) =>
        lowered.includes(w),
      )
    ) {
      s = 1;
    }
    return s;
  }, [password]);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit =
    token.length > 0 &&
    [...password].length >= MIN_LENGTH &&
    password === confirm &&
    !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not reset the password");
        setBusy(false);
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="panel w-full max-w-sm p-6">
        <h1 className="text-xl font-bold tracking-tight">Link missing</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This page needs a reset token. Open the link from your email, or
          request a new one.
        </p>
        <Link href="/forgot-password" className="btn btn-primary mt-5 w-full">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel w-full max-w-sm p-6">
      <h1 className="text-xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        This link works once and expires in 60 minutes. Changing your password
        signs you out everywhere.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="password">
            New password
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
          {password.length > 0 && (
            <>
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i <= score ? "bg-[var(--accent)]" : "bg-black/10"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]" aria-live="polite">
                Strength: {LABELS[score]}
                {password.length > 0 && [...password].length < MIN_LENGTH && (
                  <span> — at least {MIN_LENGTH} characters needed</span>
                )}
              </p>
            </>
          )}
        </div>

        <div>
          <label className="label" htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && (
            <p className="mt-1 text-xs tag tag-bad inline-block">
              Passwords do not match
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 tag tag-bad inline-block">
          {error}
        </p>
      )}

      <button className="btn btn-primary mt-5 w-full" disabled={!canSubmit}>
        {busy ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}