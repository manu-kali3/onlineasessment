"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import SystemCheck, { type HardwareResult } from "./SystemCheck";

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

  const durationMin = Math.round(
    baseDurationMin * (1 + extensionPct / 100),
  );

  const begin = useCallback(
    async (hardware: HardwareResult) => {
      if (requiresProctoring && !consented) return;
      setStarting(true);
      setError(null);
      try {
        const res = await fetch("/api/attempts/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ invitationId, hardwareCheck: hardware }),
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
    },
    [consented, invitationId, requiresProctoring, router],
  );

  return (
    <div className="space-y-4">
      <SystemCheck onPass={begin} extensionPct={extensionPct} />

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
          This attempt is already in progress. The system check runs again, then
          you return to where you left off.
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Timer: {durationMin} minutes
        {extensionPct > 0 && ` (${baseDurationMin} min plus ${extensionPct}% extension)`}.
        Starting freezes the clock and enables integrity monitoring.
        {starting && " Launching…"}
      </p>
    </div>
  );
}