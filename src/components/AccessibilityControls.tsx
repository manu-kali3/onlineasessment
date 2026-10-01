"use client";

import { useA11y } from "./AccessibilityProvider";

export function AccessibilityControls({ compact = false }: { compact?: boolean }) {
  const { textToSpeech, highContrast, timeExtensionPct, set } = useA11y();

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "panel flex flex-wrap items-center gap-4 p-4"
      }
    >
      <span className="label !mb-0">Accessibility</span>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={textToSpeech}
          onChange={(e) => set("textToSpeech", e.target.checked)}
        />
        Text to speech
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={highContrast}
          onChange={(e) => set("highContrast", e.target.checked)}
        />
        High contrast
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted)]">Time extension</span>
        <select
          className="input !w-auto !py-1"
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