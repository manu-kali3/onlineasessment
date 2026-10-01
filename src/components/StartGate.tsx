"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Pre-flight screen shown before an attempt starts. Collects proctoring consent
 * when the assessment is proctored, then opens the attempt.
 */
export default function StartGate({
  invitationId,
  resume,
  requiresProctoring,
  baseDurationMin,
  extensionPct,
}: {
  invitationId: string;
  resume: boolean;
  requiresProctoring: boolean;
  baseDurationMin: number;
  extensionPct: number;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [consented, setConsented] = useState(!requiresProctoring);
  const [error, setError] = useState<string | null>(null);

  const durationMin = Math.round(baseDurationMin * (1 + extensionPct / 100));
  const canStart = (!requiresProctoring || consented) && !starting;

  async function begin() {
    if (!canStart) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/attempts/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start the assessment");
        setStarting(false);
        return;
      }
      router.push(`/candidate/test/${data.attemptId}`);
    } catch {
      setError("Network error. Please try again.");
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      {requiresProctoring && (
        <div className="panel p-5">
          <h2 className="text-base font-semibold">Monitoring consent</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            This assessment is proctored. A webcam feed and screen recording are
            analysed for integrity signals such as a second person entering frame
            or leaving the test window. Recordings are retained for a limited
            period and reviewed only if the system flags an issue.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
            />
            I consent to proctoring for this session.
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="tag tag-bad inline-block">
          {error}
        </p>
      )}

      {resume && (
        <div className="panel p-5 text-sm text-[var(--muted)]">
          This attempt is already in progress. Resuming returns you to where you
          left off; the timer does not reset.
        </div>
      )}

      <div className="panel p-5">
        <p className="text-sm text-[var(--muted)]">
          Timer: <strong>{durationMin} minutes</strong>
          {extensionPct > 0 &&
            ` (${baseDurationMin} min plus a ${extensionPct}% approved extension)`}
          . Pressing start freezes the clock and enables integrity monitoring.
        </p>
        <button className="btn btn-primary mt-4" disabled={!canStart} onClick={() => void begin()}>
          {starting
            ? "Starting…"
            : resume
              ? "Resume assessment"
              : "Start assessment"}
        </button>
        {requiresProctoring && !consented && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Consent is required before a proctored assessment can begin.
          </p>
        )}
      </div>
    </div>
  );
}