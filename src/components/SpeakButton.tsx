"use client";

import { useState } from "react";

export function readPrompt(prompt: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(prompt);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

/** Wraps a question so TTS can read it on demand. */
export function SpeakButton({ prompt, label = "Read aloud" }: { prompt: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;

  return (
    <button
      type="button"
      className="btn btn-ghost !py-1 !px-2 !text-xs"
      aria-label={label}
      onClick={() => {
        if (playing && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          setPlaying(false);
          return;
        }
        readPrompt(prompt);
        setPlaying(true);
        window.speechSynthesis.onend = () => setPlaying(false);
      }}
    >
      {playing ? "Stop" : "Read aloud"}
    </button>
  );
}