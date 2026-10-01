"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const demoAccounts = [
  { label: "Candidate", email: "candidate@portal.test" },
  { label: "Recruiter", email: "recruiter@portal.test" },
  { label: "Assessor", email: "assessor@portal.test" },
  { label: "Admin", email: "admin@portal.test" },
];

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("candidate@portal.test");
  const [password, setPassword] = useState("Passw0rd!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign in failed");
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
    <form onSubmit={submit} className="panel w-full max-w-sm p-6">
      <h1 className="text-xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Use one of the seeded accounts below.
      </p>

      <div className="mt-5 space-y-4">
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

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md px-3 py-2 text-sm tag tag-bad"
        >
          {error}
        </p>
      )}

      <button className="btn btn-primary mt-5 w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <div className="mt-6 border-t border-[var(--line)] pt-4">
        <p className="label">Quick fill</p>
        <div className="flex flex-wrap gap-2">
          {demoAccounts.map((a) => (
            <button
              key={a.email}
              type="button"
              className="btn btn-ghost !py-1 !px-2 !text-xs"
              onClick={() => {
                setEmail(a.email);
                setPassword("Passw0rd!");
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          All demo passwords: <code className="font-semibold">Passw0rd!</code>
        </p>
      </div>
    </form>
  );
}