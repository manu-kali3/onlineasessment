/**
 * Dashboard metric tile.
 *
 * The `tone` prop only ever changes the hairline colour and the number's ink —
 * never a filled background — so a row of tiles stays scannable and does not
 * turn into a block of competing colours. `hint` is for the qualifier that makes
 * a number meaningful ("of 12 invited", "vs 60% last month").
 */
export default function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "bad" | "good" | "accent";
  hint?: string;
}) {
  const toneClass =
    tone === "bad"
      ? "text-[var(--bad)]"
      : tone === "good"
        ? "text-[var(--good)]"
        : tone === "accent"
          ? "text-[var(--accent)]"
          : "";

  const edge =
    tone === "bad"
      ? "stat-bad"
      : tone === "good"
        ? "stat-good"
        : tone === "accent"
          ? "stat-accent"
          : "";

  return (
    <div className={`panel stat ${edge}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${toneClass}`}>{value}</div>
      {hint && (
        <div className="mt-1 text-[0.72rem] leading-snug text-[var(--faint)]">
          {hint}
        </div>
      )}
    </div>
  );
}
