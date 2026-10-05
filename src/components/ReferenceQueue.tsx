"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = {
  id: string;
  referenceCode: string;
  channel: string | null;
  amountMinor: number | null;
  status: string;
  createdAt: string;
  assessmentTitle: string;
  candidateName: string;
  candidateEmail: string;
};

/**
 * Admin queue for payment references submitted outside the portal.
 *
 * Verifying grants the candidate course access. There is no partial state and
 * no undo: a mistake is corrected by granting access directly, because taking it
 * back after the candidate has started the test would be worse.
 */
export default function ReferenceQueue({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(referenceId: string, action: "verify" | "reject") {
    setBusyId(referenceId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/references/${referenceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save that decision.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted)]">
        No payment references submitted.
      </p>
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  const settled = rows.filter((r) => r.status !== "pending");

  return (
    <>
      {error && (
        <p role="alert" className="mt-4 tag tag-bad inline-block">
          {error}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-base font-semibold">
          Awaiting review{" "}
          <span className="font-normal text-[var(--muted)]">
            ({pending.length})
          </span>
        </h2>

        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Nothing waiting. Verified and rejected references are listed below.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold break-all">
                      {r.referenceCode}
                    </p>
                    <p className="mt-1 text-sm">
                      {r.candidateName}{" "}
                      <span className="text-[var(--muted)]">
                        · {r.candidateEmail}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {r.assessmentTitle}
                      {r.channel ? ` · via ${r.channel}` : ""}
                      {r.amountMinor !== null
                        ? ` · ${(r.amountMinor / 100).toFixed(2)} KES`
                        : ""}
                      {" · "}
                      {new Date(r.createdAt).toLocaleDateString("en-GB", {
                        dateStyle: "medium",
                      })}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      className="btn btn-primary"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, "verify")}
                    >
                      {busyId === r.id ? "Saving…" : "Verify & grant"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">
            Decided{" "}
            <span className="font-normal text-[var(--muted)]">
              ({settled.length})
            </span>
          </h2>
          <ul className="mt-3 space-y-2">
            {settled.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-mono break-all">{r.referenceCode}</span>{" "}
                  <span className="text-[var(--muted)]">
                    · {r.candidateEmail} · {r.assessmentTitle}
                  </span>
                </span>
                <span
                  className={`tag ${r.status === "verified" ? "tag-good" : "tag-bad"}`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}