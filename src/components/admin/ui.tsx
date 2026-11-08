/**
 * Small presentational kit for the admin area.
 *
 * These exist so every admin table renders a percentage, a status, or an
 * identity the same way. The previous pages each hand-rolled their own tag
 * colours, which is how "graded" ended up green on one screen and grey on
 * another.
 *
 * Server-safe: no hooks, no client directive.
 */
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Status pills                                                        */
/* ------------------------------------------------------------------ */

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "",
  good: "tag-good",
  warn: "tag-warn",
  bad: "tag-bad",
  accent: "tag-accent",
};

/**
 * Attempt and payment statuses share a vocabulary, so they share one mapping.
 * Anything unrecognised falls back to neutral rather than guessing a tone —
 * a status this component has not been taught is not automatically fine.
 */
export function statusTone(status: string): Tone {
  switch (status) {
    case "graded":
    case "completed":
    case "verified":
    case "success":
    case "published":
    case "active":
      return "good";
    case "submitted":
    case "in_progress":
    case "pending":
    case "draft":
      return "warn";
    case "expired":
    case "failed":
    case "rejected":
      return "bad";
    default:
      return "neutral";
  }
}

export function StatusTag({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span className={`tag tag-dot ${TONE_CLASS[statusTone(status)]}`}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`tag ${TONE_CLASS[tone]}`}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Numeric cells                                                       */
/* ------------------------------------------------------------------ */

/**
 * A 0-100 value with an inline magnitude bar.
 *
 * Used for score columns and correct-rate columns. The bar is aria-hidden
 * because the number beside it is the accessible value — a screen reader user
 * does not need a decorative div read out.
 */
export function PercentBar({
  value,
  tone,
  goodAt = 70,
  warnAt = 40,
}: {
  value: number | null;
  tone?: "good" | "warn" | "bad" | "accent";
  goodAt?: number;
  warnAt?: number;
}) {
  if (value === null) {
    return <span className="text-[var(--faint)]">—</span>;
  }
  const clamped = Math.max(0, Math.min(100, value));
  const resolved =
    tone ??
    (clamped >= goodAt ? "good" : clamped >= warnAt ? "warn" : "bad");

  return (
    <div className="mini-bar">
      <span className="mini-bar-track" aria-hidden="true">
        <span
          className={`mini-bar-fill ${
            resolved === "accent" ? "" : `is-${resolved}`
          }`}
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="mini-bar-value">{value}%</span>
    </div>
  );
}

/** An identity cell: real name for admins, a stable pseudonym otherwise. */
export function IdentityCell({
  name,
  pseudo,
  showIdentity,
}: {
  name: string;
  pseudo: string;
  showIdentity: boolean;
}) {
  if (showIdentity) {
    return <span className="text-sm font-medium">{name}</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="code">{pseudo}</span>
      <span className="text-[0.68rem] text-[var(--faint)]">blind</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/* ------------------------------------------------------------------ */

export function EmptyState({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <span aria-hidden="true" className="shrink-0 text-[var(--faint)]">
        {icon ?? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3.5" y="5" width="17" height="14" rx="2" />
            <path d="M3.5 9.5h17M8 13h8M8 16h5" />
          </svg>
        )}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Tables render this as a full-width row so the frame keeps its shape. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-sm text-[var(--muted)]">
        {children}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Banner({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`banner banner-${tone}`}>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/**
 * Panel heading with an optional count and trailing action.
 *
 * `hint` sits on its own line and is capped in width: the explanation of *why* a
 * number matters is what the old pages put in a paragraph under every heading,
 * which pushed the actual table off the first screen.
 */
export function PanelHead({
  title,
  count,
  hint,
  action,
  id,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 id={id} className="text-[0.98rem] font-semibold tracking-tight">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-sm font-normal text-[var(--faint)]">
              {count}
            </span>
          )}
        </h2>
        {hint && (
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--muted)]">
            {hint}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

export function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="summary-chevron h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}
