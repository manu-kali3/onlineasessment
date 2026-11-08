"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKes } from "@/lib/pricing";
import { EmptyState, PanelHead, StatusTag } from "./admin/ui";

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
      <div className="mt-6">
        <EmptyState>
          No payment references submitted. Candidates who pay outside the portal
          appear here for verification.
        </EmptyState>
      </div>
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  const settled = rows.filter((r) => r.status !== "pending");

  return (
    <>
      {error && (
        <div role="alert" className="banner banner-bad mt-4">
          <span className="font-medium">{error}</span>
        </div>
      )}

      <section className="mt-6">
        <PanelHead
          title="Awaiting review"
          count={pending.length}
          hint="Each row shows the code, who submitted it, and which course it claims to pay for. Verifying grants access immediately."
        />

        {pending.length === 0 ? (
          <div className="mt-3">
            <EmptyState>
              Nothing waiting. Verified and rejected references are listed below.
            </EmptyState>
          </div>
        ) : (
          <ul className="row-list panel mt-3 overflow-hidden">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 bg-[var(--panel)] p-4">
                <div className="min-w-0 flex-1">
                  {/* The code is the thing being checked against a phone
                      notification, so it is the visual anchor of the row. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="code text-sm font-semibold">
                      {r.referenceCode}
                    </span>
                    <StatusTag status={r.status} />
                  </div>

                  <dl className="meta mt-2">
                    <div>
                      <dt>From</dt>
                      <dd className="!font-medium">{r.candidateName}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd className="!font-normal text-[var(--muted)]">
                        {r.candidateEmail}
                      </dd>
                    </div>
                    <div>
                      <dt>Course</dt>
                      <dd className="!font-medium">{r.assessmentTitle}</dd>
                    </div>
                    {r.amountMinor !== null && (
                      <div>
                        <dt>Claimed</dt>
                        <dd>{formatKes(r.amountMinor)}</dd>
                      </div>
                    )}
                    {r.channel && (
                      <div>
                        <dt>Via</dt>
                        <dd className="!font-normal">{r.channel}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Submitted</dt>
                      <dd className="!font-normal">
                        {new Date(r.createdAt).toLocaleDateString("en-GB", {
                          dateStyle: "medium",
                        })}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busyId === r.id}
                    onClick={() => void decide(r.id, "verify")}
                  >
                    {busyId === r.id ? "Saving…" : "Verify & grant"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === r.id}
                    onClick={() => void decide(r.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 && (
        <section className="mt-8">
          <PanelHead
            title="Decided"
            count={settled.length}
            hint="Kept for reference. There is no undo — a mistaken verification is corrected by granting access directly."
          />
          <ul className="row-list panel mt-3 overflow-hidden">
            {settled.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="code">{r.referenceCode}</span>
                  <span className="text-[var(--muted)]">
                    {r.candidateEmail} · {r.assessmentTitle}
                  </span>
                </span>
                <StatusTag status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}