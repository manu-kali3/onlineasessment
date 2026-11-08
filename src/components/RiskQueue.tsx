"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Item = {
  attemptId: string;
  candidateName: string;
  integrityScore: number;
  criticalEvents: number;
};

export default function RiskQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);

  async function clear(attemptId: string, resolution: string) {
    await fetch("/api/admin/proctor/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attemptId, resolution }),
    });
    startTransition(() => router.refresh());
  }

  if (items.length === 0) {
    return (
      <div className="empty mt-4">
        <span aria-hidden="true" className="text-[var(--good)]">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 7.7 7 9.2 4.1-1.5 7-4.9 7-9.2V6.2z" />
            <path d="M9.2 12.2l2 2 3.6-3.9" />
          </svg>
        </span>
        <span>No flagged attempts. Every proctoring signal so far looks clean.</span>
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li
          key={item.attemptId}
          className="rounded-[10px] border border-[var(--line)] bg-[var(--panel-2)] p-3 transition-colors hover:border-[var(--line-strong)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{item.candidateName}</div>
              <div className="text-xs text-[var(--muted)]">
                Integrity {item.integrityScore}
                {item.criticalEvents > 0 && ` · ${item.criticalEvents} critical`}
              </div>
            </div>
            <span
              className={`tag tag-dot ${
                item.integrityScore < 70 ? "tag-bad" : "tag-warn"
              }`}
            >
              {item.integrityScore < 70 ? "High risk" : "Review"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen(open === item.attemptId ? null : item.attemptId)}
              aria-expanded={open === item.attemptId}
            >
              {open === item.attemptId ? "Hide signals" : "View signals"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => void clear(item.attemptId, "Reviewed: no violation found")}
            >
              Clear
            </button>
            <button
              className="btn btn-danger btn-sm"
              disabled={pending}
              onClick={() => void clear(item.attemptId, "Upheld: proctoring violation")}
            >
              Uphold
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}