"use client";

import Link from "next/link";
import { TableWrap } from "./TableWrap";

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
      <p className="mt-4 rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">
        No submitted attempts yet.
      </p>
    );
  }

  return (
    <>
      {blindReview && (
        <p className="mt-2 text-xs tag tag-good inline-block">
          Blind review on · identities hidden
        </p>
      )}
      <TableWrap className="mt-3" label="Submitted attempts">
      <table className="table">
        <thead>
          <tr>
            <th>{showIdentity ? "Candidate" : "Reference"}</th>
            <th>Assessment</th>
            <th>Score</th>
            <th>Percentile</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.attemptId}>
              <td className="font-mono text-xs">
                {showIdentity ? r.candidateName : r.candidateRef}
              </td>
              <td>{r.assessmentTitle}</td>
              <td className="tabular-nums">
                {r.score !== null ? `${r.score}%` : "—"}
              </td>
              <td className="tabular-nums">{r.percentile ?? "—"}</td>
              <td>
                <span
                  className={`tag ${r.needsReview ? "tag-warn" : "tag-good"}`}
                >
                  {r.needsReview ? "Review pending" : "Graded"}
                </span>
              </td>
              <td className="text-right">
                <Link
                  href={`/admin/attempts/${r.attemptId}`}
                  className="btn btn-ghost !py-1 !px-2 !text-xs"
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