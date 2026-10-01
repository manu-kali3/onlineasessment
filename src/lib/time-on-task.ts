/** Helpers for reading attempt timing without pulling in a date library. */

export function msSince(start: Date, end = new Date()) {
  return Math.max(0, end.getTime() - start.getTime());
}

export function remainingSeconds(start: Date, durationMin: number, end = new Date()) {
  return Math.max(0, Math.floor((durationMin * 60_000 - msSince(start, end)) / 1000));
}

export function fmtCountdown(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function fmtDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}