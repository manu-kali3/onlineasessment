"use client";

import Link from "next/link";
import { TableWrap } from "./TableWrap";
import { EmptyState, IdentityCell, PercentBar, StatusTag } from "./admin/ui";

export type QueueRow = {
  candidateRef: string;
  candidateName: string;
  attemptId: string;
  assessmentTitle: string;
  score: number | null;
  percentile: number | null;
  status: string;
  needsReview: boolean;
};

export default function BlindQueueTable({
  rows,
  showIdentity,
  blindReview,
}: {
  rows: QueueRow[];
  showIdentity: boolean;
  blindReview: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-3">
        <EmptyState>
          No submitted attempts yet. Attempts land here as candidates submit.
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      {blindReview && (
        <p className="banner banner-good mt-3 text-xs">
          <span>
            <span className="font-semibold">Blind review on.</span> Candidate
            names, email addresses, and free-text answers are withheld from this
            view.
          </span>
        </p>
      )}
      <TableWrap className="mt-3" label="Submitted attempts">
      <table className="table">
        <thead>
          <tr>
            <th>{showIdentity ? "Candidate" : "Reference"}</th>
            <th>Assessment</th>
            <th>Score</th>
            <th className="num">Percentile</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.attemptId}>
              <td>
                <IdentityCell
                  name={r.candidateName}
                  pseudo={r.candidateRef}
                  showIdentity={showIdentity}
                />
              </td>
              <td className="text-[var(--muted)]">{r.assessmentTitle}</td>
              <td>
                <PercentBar value={r.score} tone="accent" />
              </td>
              <td className="num text-[var(--muted)]">
                {r.percentile ?? "—"}
              </td>
              <td>
                <StatusTag
                  status={r.needsReview ? "submitted" : "graded"}
                  label={r.needsReview ? "Review pending" : "Graded"}
                />
              </td>
              <td className="text-right">
                <Link
                  href={`/admin/attempts/${r.attemptId}`}
                  className="btn btn-quiet btn-sm"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
    </>
  );
}