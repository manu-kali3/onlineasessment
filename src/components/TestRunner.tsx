"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProctorLock from "./ProctorLock";
import { SpeakButton } from "./SpeakButton";
import { useA11y } from "./AccessibilityProvider";
import { fmtCountdown } from "@/lib/time-on-task";

export type RunnerQuestion = {
  id: string;
  type: string;
  prompt: string;
  options: { id: string; label: string }[];
  codingSpec: {
    language: string;
    starterCode: string;
    functionName: string;
    testCases: { input: string; expected: string }[];
  } | null;
  timeLimitSec: number | null;
};



export default function TestRunner({
  attemptId,
  title,
  questions,
  initialResponses,
  startedAtMs,
  durationMin,
  timeExtensionPct,
  proctoring,
}: {
  attemptId: string;
  title: string;
  questions: RunnerQuestion[];
  initialResponses: { questionId: string; answer: unknown; durationMs: number | null }[];
  startedAtMs: number;
  durationMin: number;
  timeExtensionPct: number;
  proctoring: boolean;
}) {
  const router = useRouter();
  const { highContrast, textToSpeech } = useA11y();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(initialResponses.map((r) => [r.questionId, r.answer])),
  );
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  const current = questions[index];
  const questionStartedAt = useRef(Date.now());

  // Autosave reads the latest answers through a ref. If it depended on state
  // directly, the interval would be torn down and recreated on every keystroke
  // and would effectively never fire while the candidate is typing.
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const totalMs = durationMin * 60_000 * (1 + timeExtensionPct / 100);
  const deadline = startedAtMs + totalMs;

  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
  );

  /* -------- server-authoritative countdown -------- */
  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  /* -------- autosave: on navigation + every 15s -------- */
  const save = useCallback(
    async (questionId: string, answer: unknown, durationMs: number) => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/attempts/response", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId, questionId, answer, durationMs }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    },
    [attemptId],
  );

  // Stable identity: reads live answers/current via refs so the 15s interval is
  // created once instead of on every keystroke.
  const persistCurrent = useCallback(async () => {
    const q = currentRef.current;
    if (!q) return;
    const spent = Date.now() - questionStartedAt.current;
    questionStartedAt.current = Date.now();
    await save(q.id, answersRef.current[q.id] ?? null, spent);
  }, [save]);

  useEffect(() => {
    const timer = setInterval(() => void persistCurrent(), 15_000);
    return () => clearInterval(timer);
  }, [persistCurrent]);

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function goTo(next: number) {
    await persistCurrent();
    setIndex(Math.max(0, Math.min(next, questions.length - 1)));
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    setSubmitting(true);
    await persistCurrent();
    try {
      const res = await fetch("/api/attempts/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      if (res.ok) {
        router.push(`/candidate/results/${attemptId}`);
        return;
      }
    } catch {
      // fall through to the error state below
    }
    setSubmitting(false);
  }

  // Auto-submit the moment the clock hits zero. Guarded on a ref so a re-render
  // cannot fire a second submit request.
  const submitted = useRef(false);
  useEffect(() => {
    if (remaining === 0 && !submitted.current) {
      submitted.current = true;
      void submit();
    }
  }, [remaining]);

  const answeredCount = questions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && a !== null && !(Array.isArray(a) && a.length === 0);
  }).length;

  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <h1 className="text-sm font-bold tracking-tight">{title}</h1>
          <span className="tag">
            {answeredCount}/{questions.length} answered
          </span>
          <div className="ml-auto flex items-center gap-3">
            {/*
              The countdown is the one number a candidate checks constantly, so
              it gets a bordered chip and turns red for the last five minutes.
              aria-live is on the chip, not the digits, so it is announced as a
              whole rather than on every tick.
            */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-base font-bold tabular-nums transition-colors ${
                remaining < 300
                  ? "border-[color-mix(in_srgb,var(--bad)_35%,transparent)] bg-[var(--bad-soft)] text-[var(--bad)]"
                  : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--ink)]"
              }`}
              aria-live="polite"
              aria-label={`${Math.floor(remaining / 60)} minutes remaining`}
            >
              <span aria-hidden="true" className="text-[var(--faint)]">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 1.8" />
                </svg>
              </span>
              {fmtCountdown(remaining)}
            </span>
            <SaveIndicator state={saveState} />
          </div>
        </div>
        {/* Slim progress rail: answers given against items total. */}
        <div
          aria-hidden="true"
          className="h-0.5 w-full bg-[var(--line)]"
        >
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-300"
            style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }}
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
        <ProctorLock attemptId={attemptId} proctoring={proctoring} />

        <div className="mt-4 flex items-center justify-between">
          <span className="eyebrow">
            Question {index + 1}{" "}
            <span className="text-[var(--faint)]">of {questions.length}</span>
          </span>
          <div className="flex items-center gap-2">
            {current && (
              <SpeakButton prompt={current.prompt} autoRead={textToSpeech} />
            )}
            <button
              type="button"
              className={`btn btn-sm ${
                flagged.has(current?.id)
                  ? "btn-primary"
                  : "btn-ghost"
              }`}
              onClick={() =>
                setFlagged((prev) => {
                  const next = new Set(prev);
                  if (next.has(current.id)) next.delete(current.id);
                  else next.add(current.id);
                  return next;
                })
              }
            >
              {flagged.has(current?.id) ? "Unflag" : "Flag for review"}
            </button>
          </div>
        </div>

        <div
          className={`panel mt-3 p-5 shadow-[var(--shadow-md)] sm:p-6 ${highContrast ? "border-2 border-black" : ""}`}
          data-allow-copy="true"
        >
          <QuestionInput
            question={current}
            value={answers[current?.id]}
            onChange={(v) => setAnswer(current.id, v)}
          />
        </div>

        <nav className="mt-5 flex items-center justify-between gap-3">
          <button
            className="btn btn-ghost"
            onClick={() => void goTo(index - 1)}
            disabled={index === 0}
          >
            ← Previous
          </button>
          <span className="text-xs tabular-nums text-[var(--faint)] sm:hidden">
            {index + 1} / {questions.length}
          </span>
          <button
            className="btn btn-primary"
            onClick={() => void goTo(index + 1)}
            disabled={index === questions.length - 1}
          >
            Next →
          </button>
        </nav>

        <section className="panel mt-6 p-5">
          <div className="section-head">
            <h2 className="text-sm font-semibold">Review all questions</h2>
            <span className="text-xs text-[var(--faint)]">
              <span className="text-[var(--good)]">●</span> answered{" "}
              <span className="text-[var(--warn)]">*</span> flagged
            </span>
          </div>
          <ol className="mt-3 flex flex-wrap gap-2">
            {questions.map((q, i) => {
              const a = answers[q.id];
              const done =
                a !== undefined && a !== null && !(Array.isArray(a) && a.length === 0);
              return (
                <li key={q.id}>
                  <button
                    onClick={() => void goTo(i)}
                    aria-current={i === index}
                    className={`relative h-9 w-9 rounded-md border text-sm font-semibold tabular-nums transition-colors ${
                      i === index
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                        : done
                          ? "border-[color-mix(in_srgb,var(--good)_40%,transparent)] bg-[var(--good-soft)] text-[var(--good)]"
                          : "border-[var(--line-strong)] text-[var(--muted)] hover:border-[var(--muted)]"
                    }`}
                  >
                    {i + 1}
                    {flagged.has(q.id) && (
                      <span
                        aria-label="flagged"
                        className="absolute -top-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--warn)] text-[9px] leading-none font-bold text-white"
                      >
                        !
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="btn btn-primary"
              disabled={submitting}
              onClick={() => setConfirming(true)}
            >
              {submitting ? "Submitting…" : "Submit assessment"}
            </button>
            <span className="text-xs text-[var(--muted)]">
              {answeredCount} of {questions.length} answered
              {questions.length - answeredCount > 0 &&
                ` · ${questions.length - answeredCount} left blank`}
            </span>
          </div>
        </section>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(16,19,34,0.45)] p-4 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirming(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
            className="panel w-full max-w-md p-6 shadow-[var(--shadow-lg)]"
          >
            <h2 id="submit-title" className="text-lg font-bold tracking-tight">
              Submit now?
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              You answered {answeredCount} of {questions.length} questions. Once
              submitted you cannot change your answers.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="btn btn-ghost"
                onClick={() => setConfirming(false)}
              >
                Keep working
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SaveIndicator({ state }: { state: string }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
        />
        Saving…
      </span>
    );
  if (state === "saved")
    return <span className="tag tag-good tag-dot">Saved</span>;
  if (state === "error") return <span className="tag tag-bad tag-dot">Save failed</span>;
  return null;
}

/* ------------------------------------------------------------------ */
/* Per-type inputs                                                     */
/* ------------------------------------------------------------------ */

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: RunnerQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (!question) return null;

  if (question.type === "multiple_choice" || question.type === "true_false") {
    return (
      <fieldset className="space-y-2">
        <legend className="text-[1.05rem] leading-relaxed font-medium text-balance">
          {question.prompt}
        </legend>
        <div className="mt-5 space-y-2.5">
          {question.options.length === 0 && question.type === "true_false" && (
            <>
              <Choice label="True" checked={value === true} onChange={() => onChange(true)} />
              <Choice label="False" checked={value === false} onChange={() => onChange(false)} />
            </>
          )}
          {question.options.map((opt) => (
            <Choice
              key={opt.id}
              label={opt.label}
              checked={value === opt.id}
              onChange={() => onChange(opt.id)}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === "multi_select") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="space-y-2">
        <legend className="text-[1.05rem] leading-relaxed font-medium text-balance">
          {question.prompt}
        </legend>
        <p className="text-xs text-[var(--muted)]">Select all that apply.</p>
        <div className="mt-4 space-y-2.5">
          {question.options.map((opt) => (
            <Choice
              key={opt.id}
              label={opt.label}
              multi
              checked={selected.includes(opt.id)}
              onChange={() =>
                onChange(
                  selected.includes(opt.id)
                    ? selected.filter((s) => s !== opt.id)
                    : [...selected, opt.id],
                )
              }
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === "coding") {
    const code =
      typeof value === "object" && value && "code" in value
        ? String((value as { code: string }).code)
        : question.codingSpec?.starterCode ?? "";
    return (
      <div>
        <p className="text-[1.05rem] leading-relaxed font-medium text-balance">{question.prompt}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Language: {question.codingSpec?.language}. Your code is compiled and
          tested against {question.codingSpec?.testCases.length ?? 0} cases on submit.
        </p>
        <textarea
          data-allow-copy="true"
          className="input mt-4 min-h-64 font-mono text-sm leading-relaxed"
          spellCheck={false}
          value={code}
          onChange={(e) =>
            onChange({ code: e.target.value, language: question.codingSpec?.language ?? "javascript" })
          }
        />
      </div>
    );
  }

  if (question.type === "video") {
    const hasRecording = typeof value === "string" && value.startsWith("blob:");
    return (
      <div>
        <p className="text-[1.05rem] leading-relaxed font-medium text-balance">{question.prompt}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Record up to 3 minutes. A human assessor scores this against the rubric.
        </p>
        <div className="mt-4">
          {hasRecording ? (
            <video
              controls
              className="w-full rounded-lg"
              src={String(value)}
              data-allow-copy="true"
            />
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Video capture placeholder — wire this to your media recorder component.
            </p>
          )}
          <button
            type="button"
            className="btn btn-ghost mt-3"
            onClick={() => onChange("blob:recorded")}
          >
            {hasRecording ? "Re-record" : "Start recording"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={`q-${question.id}`}
        className="block text-[1.05rem] leading-relaxed font-medium text-balance"
      >
        {question.prompt}
      </label>
      <textarea
        id={`q-${question.id}`}
        data-allow-copy="true"
        className="input mt-4 min-h-52 leading-relaxed"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-2 text-xs text-[var(--muted)]">
        This response is scored by an assessor against a rubric.
      </p>
    </div>
  );
}

function Choice({
  label,
  checked,
  multi = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  multi?: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3.5 transition-all duration-150 ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_1px_var(--accent-line)]"
          : "border-[var(--line-strong)] hover:border-[var(--muted)] hover:bg-[var(--panel-2)]"
      }`}
    >
      <input
        type={multi ? "checkbox" : "radio"}
        name={label}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span
        className={`text-sm leading-relaxed ${
          checked ? "font-medium text-[var(--ink)]" : ""
        }`}
      >
        {label}
      </span>
    </label>
  );
}