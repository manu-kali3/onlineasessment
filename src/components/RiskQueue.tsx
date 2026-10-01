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
      <p className="mt-4 rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">
        No flagged attempts. Every proctoring signal so far looks clean.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.attemptId} className="rounded-lg border border-[var(--line)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{item.candidateName}</div>
              <div className="text-xs text-[var(--muted)]">
                Integrity {item.integrityScore}
                {item.criticalEvents > 0 && ` · ${item.criticalEvents} critical`}
              </div>
            </div>
            <span
              className={`tag ${
                item.integrityScore < 70 ? "tag-bad" : "tag-warn"
              }`}
            >
              {item.integrityScore < 70 ? "High risk" : "Review"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost !py-1 !px-2 !text-xs"
              onClick={() => setOpen(open === item.attemptId ? null : item.attemptId)}
              aria-expanded={open === item.attemptId}
            >
              {open === item.attemptId ? "Hide signals" : "View signals"}
            </button>
            <button
              className="btn btn-ghost !py-1 !px-2 !text-xs"
              disabled={pending}
              onClick={() => void clear(item.attemptId, "Reviewed: no violation found")}
            >
              Clear
            </button>
            <button
              className="btn btn-ghost !py-1 !px-2 !text-xs"
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