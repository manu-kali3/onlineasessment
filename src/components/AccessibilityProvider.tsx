"use client";

import { createContext, useContext, useEffect, useState } from "react";

type A11y = {
  textToSpeech: boolean;
  highContrast: boolean;
  timeExtensionPct: number;
};

type Ctx = A11y & {
  set: <K extends keyof A11y>(key: K, value: A11y[K]) => void;
  speechEnabled: boolean;
};

const A11yContext = createContext<Ctx | null>(null);

export function useA11y() {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error("useA11y must be used inside AccessibilityProvider");
  return ctx;
}

export function AccessibilityProvider({
  initial,
  children,
}: {
  initial: Partial<A11y>;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<A11y>({
    textToSpeech: initial.textToSpeech ?? false,
    highContrast: initial.highContrast ?? false,
    timeExtensionPct: initial.timeExtensionPct ?? 0,
  });

  useEffect(() => {
    document.documentElement.dataset.contrast = state.highContrast
      ? "high"
      : "normal";
  }, [state.highContrast]);

  function set<K extends keyof A11y>(key: K, value: A11y[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <A11yContext.Provider value={{ ...state, set, speechEnabled: state.textToSpeech }}>
      {children}
    </A11yContext.Provider>
  );
}