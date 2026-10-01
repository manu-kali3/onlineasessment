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
  const { highContrast } = useA11y();

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
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-6 py-3">
          <h1 className="text-sm font-bold tracking-tight">{title}</h1>
          <span className="tag">{answeredCount}/{questions.length} answered</span>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`font-mono text-lg font-bold tabular-nums ${
                remaining < 300 ? "text-[var(--bad)]" : ""
              }`}
              aria-live="polite"
              aria-label={`${Math.floor(remaining / 60)} minutes remaining`}
            >
              {fmtCountdown(remaining)}
            </span>
            <SaveIndicator state={saveState} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-6">
        <ProctorLock attemptId={attemptId} proctoring={proctoring} onEvent={() => {}} />

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Question {index + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-2">
            {current && <SpeakButton prompt={current.prompt} />}
            <button
              type="button"
              className="btn btn-ghost !py-1 !px-2 !text-xs"
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
          className={`panel mt-3 p-6 ${highContrast ? "border-2 border-black" : ""}`}
          data-allow-copy="true"
        >
          <QuestionInput
            question={current}
            value={answers[current?.id]}
            onChange={(v) => setAnswer(current.id, v)}
          />
        </div>

        <nav className="mt-5 flex items-center justify-between">
          <button
            className="btn btn-ghost"
            onClick={() => void goTo(index - 1)}
            disabled={index === 0}
          >
            ← Previous
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void goTo(index + 1)}
            disabled={index === questions.length - 1}
          >
            Next →
          </button>
        </nav>

        <section className="panel mt-6 p-5">
          <h2 className="text-sm font-semibold">Review all questions</h2>
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
                    className={`h-9 w-9 rounded-md border text-sm font-semibold ${
                      i === index
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : done
                          ? "border-[var(--good)] bg-[color-mix(in_srgb,var(--good)_10%,transparent)]"
                          : "border-[var(--line)] text-[var(--muted)]"
                    }`}
                  >
                    {i + 1}
                    {flagged.has(q.id) && <span aria-label="flagged">*</span>}
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
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
          <div className="panel w-full max-w-md p-6">
            <h2 className="text-lg font-bold">Submit now?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              You answered {answeredCount} of {questions.length} questions. Once
              submitted you cannot change your answers.
            </p>
            <div className="mt-5 flex gap-3">
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
  if (state === "saving") return <span className="text-xs text-[var(--muted)]">Saving…</span>;
  if (state === "saved") return <span className="text-xs tag tag-good">Saved</span>;
  if (state === "error") return <span className="text-xs tag tag-bad">Save failed</span>;
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
        <legend className="text-base font-medium text-balance">{question.prompt}</legend>
        <div className="mt-4 space-y-2">
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
        <legend className="text-base font-medium text-balance">{question.prompt}</legend>
        <p className="text-xs text-[var(--muted)]">Select all that apply.</p>
        <div className="mt-3 space-y-2">
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
        <p className="text-base font-medium text-balance">{question.prompt}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Language: {question.codingSpec?.language}. Your code is compiled and
          tested against {question.codingSpec?.testCases.length ?? 0} cases on submit.
        </p>
        <textarea
          data-allow-copy="true"
          className="input mt-4 min-h-64 font-mono text-sm"
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
        <p className="text-base font-medium text-balance">{question.prompt}</p>
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
        className="text-base font-medium text-balance"
      >
        {question.prompt}
      </label>
      <textarea
        id={`q-${question.id}`}
        data-allow-copy="true"
        className="input mt-4 min-h-52"
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
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
        checked
          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
          : "border-[var(--line)] hover:bg-black/[0.02]"
      }`}
    >
      <input
        type={multi ? "checkbox" : "radio"}
        name={label}
        checked={checked}
        onChange={onChange}
        className="mt-0.5"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}