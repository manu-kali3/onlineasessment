"use client";

import { useA11y } from "./AccessibilityProvider";

export function AccessibilityControls({ compact = false }: { compact?: boolean }) {
  const { textToSpeech, highContrast, timeExtensionPct, set } = useA11y();

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "panel panel-2 panel-flat flex flex-wrap items-center gap-x-5 gap-y-3 border border-[var(--line)] p-3.5"
      }
    >
      <span className="label !mb-0 flex items-center gap-1.5">
        <span aria-hidden="true" className="text-[var(--faint)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="4.5" r="1.6" />
            <path d="M12 6.5v6M6.5 9.5l5.5 2 5.5-2M9 20.5l3-6 3 6" />
          </svg>
        </span>
        Accessibility
      </span>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={textToSpeech}
          onChange={(e) => set("textToSpeech", e.target.checked)}
        />
        Text to speech
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={highContrast}
          onChange={(e) => set("highContrast", e.target.checked)}
        />
        High contrast
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted)]">Time extension</span>
        <select
          className="input !w-auto !py-1 !px-2 !text-sm"
          value={timeExtensionPct}
          onChange={(e) => set("timeExtensionPct", Number(e.target.value))}
        >
          <option value={0}>None</option>
          <option value={25}>+25%</option>
          <option value={50}>+50%</option>
        </select>
      </label>
    </div>
  );
}