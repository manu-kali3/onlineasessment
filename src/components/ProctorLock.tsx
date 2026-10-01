"use client";

import { useCallback, useEffect, useRef } from "react";
import { useA11y } from "./AccessibilityProvider";

type Severity = "info" | "warning" | "critical";

type Props = {
  attemptId: string;
  proctoring: boolean;
  onEvent: (type: string, severity: Severity) => void;
};

/**
 * Browser lockdown surface: blocks tab switches, fullscreen exit, and clipboard
 * actions. It records signals rather than pretending to be unbypassable — a
 * determined candidate can always defeat client-side JS, so the server treats
 * these as evidence for a human reviewer, not as ground truth.
 */
export default function ProctorLock({ attemptId, proctoring, onEvent }: Props) {
  const { textToSpeech } = useA11y();
  const queue = useRef<{ type: string; severity: Severity }[]>([]);

  const push = useCallback(
    (type: string, severity: Severity) => {
      onEvent(type, severity);
      queue.current.push({ type, severity });
    },
    [onEvent],
  );

  // Batch writes: signals are buffered and flushed every 10s so a flailing
  // candidate cannot turn proctoring into a write-amplification problem.
  useEffect(() => {
    if (!proctoring) return;

    const flush = async () => {
      const batch = queue.current;
      if (!batch.length) return;
      queue.current = [];
      for (const item of batch) {
        try {
          await fetch("/api/attempts/proctor", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              attemptId,
              type: item.type,
              severity: item.severity,
            }),
            keepalive: true,
          });
        } catch {
          // A dropped signal is preferable to interrupting the candidate
        }
      }
    };

    const timer = setInterval(flush, 10_000);
    const onPageHide = () => {
      void flush();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      void flush();
    };
  }, [attemptId, proctoring]);

  useEffect(() => {
    if (!proctoring) return;

    const onVisibility = () => {
      if (document.hidden) push("tab_switch", "warning");
    };
    const onFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      push(isFull ? "fullscreen_enter" : "fullscreen_exit", isFull ? "info" : "critical");
    };
    const onBlur = () => push("window_blur", "info");
    const onCopy = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.dataset?.allowCopy) return;
      e.preventDefault();
      push("copy_attempt", "warning");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      push("paste_attempt", "critical");
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [proctoring, push]);

  if (!proctoring) return null;

  return (
    <div
      data-allow-copy="true"
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs tag tag-warn"
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--warn)]" />
      Proctoring active{textToSpeech ? " · text-to-speech on" : ""}
    </div>
  );
}