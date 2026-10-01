export default function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "bad" | "good";
}) {
  const toneClass =
    tone === "bad" ? "text-[var(--bad)]" : tone === "good" ? "text-[var(--good)]" : "";
  return (
    <div className="panel p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}