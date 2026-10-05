"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Enrols the signed-in candidate in a course.
 *
 * Free courses enrol in place. Paid courses are handed to the per-course
 * checkout, because taking money belongs to the payment endpoint and must never
 * be triggered by a plain POST.
 */
export default function EnrolButton({
  assessmentId,
  priceMinor,
  enrolled = false,
  label,
}: {
  assessmentId: string;
  priceMinor: number;
  /** Optional: the catalog only renders this button when not yet enrolled. */
  enrolled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enrol() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attempts/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assessmentId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Could not enrol.");
        return;
      }

      if (data.checkoutUrl) {
        router.push(data.checkoutUrl);
        return;
      }
      if (data.alreadyEnrolled || data.enrolled) {
        router.refresh();
        return;
      }
      setError(data.error ?? "Could not enrol.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn btn-primary"
        disabled={busy || enrolled}
        onClick={() => void enrol()}
      >
        {busy
          ? "Enrolling…"
          : enrolled
            ? "Enrolled"
            : priceMinor > 0
              ? label ?? "Enrol"
              : "Enrol free"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-[var(--bad)]">
          {error}
        </p>
      )}
    </div>
  );
}
