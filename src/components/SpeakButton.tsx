"use client";

import { useEffect, useState } from "react";

function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function readPrompt(prompt: string) {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(prompt);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

/**
 * Reads a question aloud for candidates who benefit from text-to-speech.
 *
 * Support is detected in an effect rather than during render: branching on
 * `typeof window` in the render body returns the button on the server and
 * nothing on the client, which is a hydration mismatch.
 *
 * When `autoRead` is set (the candidate's saved text-to-speech preference), the
 * prompt is spoken as soon as it changes — so navigating questions reads each
 * new one without the candidate reaching for the button.
 */
export function SpeakButton({
  prompt,
  label = "Read aloud",
  autoRead = false,
}: {
  prompt: string;
  label?: string;
  autoRead?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setSupported(speechSupported());
  }, []);

  useEffect(() => {
    if (!speechSupported()) return;
    // `onend` is a standard property but is missing from some TS DOM lib
    // versions, so assign through a narrow local type.
    const synth = window.speechSynthesis as SpeechSynthesis & {
      onend?: (() => void) | null;
    };
    synth.onend = () => setPlaying(false);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (autoRead && supported && prompt) {
      readPrompt(prompt);
      setPlaying(true);
    }
  }, [autoRead, supported, prompt]);

  if (!supported) return null;

  return (
    <button
      type="button"
      className="btn btn-ghost !py-1 !px-2 !text-xs"
      aria-label={label}
      aria-pressed={playing}
      onClick={() => {
        if (playing && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          setPlaying(false);
          return;
        }
        readPrompt(prompt);
        setPlaying(true);
      }}
    >
      {playing ? "Stop" : "Read aloud"}
    </button>
  );
}