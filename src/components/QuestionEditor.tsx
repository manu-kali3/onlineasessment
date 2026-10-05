"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKes } from "@/lib/pricing";

const TYPES = [
  { value: "multiple_choice", label: "Multiple choice", gradable: true },
  { value: "multi_select", label: "Multi-select", gradable: true },
  { value: "true_false", label: "True / False", gradable: true },
  { value: "free_text", label: "Written response", gradable: false },
  { value: "coding", label: "Coding", gradable: false },
] as const;

type DraftQuestion = {
  type: string;
  prompt: string;
  options: { id: string; label: string }[];
  correctAnswer: string;
  rubric: string;
  competencyId: string;
  difficulty: string;
  timeLimitSec: string;
};

const EMPTY: DraftQuestion = {
  type: "multiple_choice",
  prompt: "",
  options: [
    { id: "a", label: "" },
    { id: "b", label: "" },
    { id: "c", label: "" },
    { id: "d", label: "" },
  ],
  correctAnswer: "a",
  rubric: "",
  competencyId: "",
  difficulty: "0.5",
  timeLimitSec: "300",
};

export default function QuestionEditor({
  competencies,
  assessmentId,
  assessmentTitle,
}: {
  competencies: { id: string; name: string }[];
  assessmentId: string;
  assessmentTitle: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftQuestion>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const isObjective =
    draft.type === "multiple_choice" ||
    draft.type === "multi_select" ||
    draft.type === "true_false";

  function set<K extends keyof DraftQuestion>(key: K, value: DraftQuestion[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function setOption(id: string, label: string) {
    set(
      "options",
      draft.options.map((o) => (o.id === id ? { ...o, label } : o)),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);

    const payload = {
      assessmentId,
      question: {
        type: draft.type,
        prompt: draft.prompt,
        options: draft.options.filter((o) => o.label.trim() !== ""),
        correctAnswer: isObjective
          ? draft.type === "true_false"
            ? draft.correctAnswer === "true"
            : draft.correctAnswer
          : null,
        rubric: draft.rubric.trim()
          ? draft.rubric
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((criterion) => ({
                criterion,
                weight: 1,
                levels: ["Meets the criterion", "Does not meet it"],
              }))
          : null,
        competencyId: draft.competencyId || null,
        difficulty: draft.difficulty ? Number(draft.difficulty) : null,
        timeLimitSec: draft.timeLimitSec ? Number(draft.timeLimitSec) : null,
      },
    };

    if (payload.question.options.length < 2 && isObjective) {
      setError("Give at least two options.");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save the question.");
        setBusy(false);
        return;
      }
      setOk(true);
      setDraft(EMPTY);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="panel mt-4 space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Add a question</h2>
        <span className="tag">to {assessmentTitle}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="q-type">
            Type
          </label>
          <select
            id="q-type"
            className="input"
            value={draft.type}
            onChange={(e) => set("type", e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
                {t.gradable ? "" : " · assessor scored"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q-comp">
            Competency
          </label>
          <select
            id="q-comp"
            className="input"
            value={draft.competencyId}
            onChange={(e) => set("competencyId", e.target.value)}
          >
            <option value="">— none —</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="q-prompt">
          Question
        </label>
        <textarea
          id="q-prompt"
          className="input min-h-24"
          required
          value={draft.prompt}
          onChange={(e) => set("prompt", e.target.value)}
        />
      </div>

      {isObjective && (
        <fieldset className="space-y-2">
          <legend className="label">Options and the correct answer</legend>
          {draft.options.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type={draft.type === "multi_select" ? "checkbox" : "radio"}
                name="correct"
                checked={
                  draft.type === "multi_select"
                    ? false
                    : draft.correctAnswer === o.id
                }
                disabled={draft.type === "multi_select"}
                onChange={() => set("correctAnswer", o.id)}
                aria-label={`Mark option ${o.id} correct`}
              />
              <span className="w-5 font-mono text-sm text-[var(--muted)]">
                {o.id})
              </span>
              <input
                className="input"
                value={o.label}
                onChange={(e) => setOption(o.id, e.target.value)}
                placeholder={`Option ${o.id}`}
                required
              />
            </div>
          ))}
          {draft.type === "true_false" && (
            <p className="text-xs text-[var(--muted)]">
              Select the radio beside the correct statement.
            </p>
          )}
        </fieldset>
      )}

      <div>
        <label className="label" htmlFor="q-rubric">
          Rubric criteria <span className="font-normal">(one per line, assessor scored)</span>
        </label>
        <textarea
          id="q-rubric"
          className="input min-h-20 font-mono text-xs"
          placeholder={"States the correct answer\nUses correct terminology"}
          value={draft.rubric}
          onChange={(e) => set("rubric", e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="q-diff">
            Difficulty (0 easy – 1 hard)
          </label>
          <input
            id="q-diff"
            className="input"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.difficulty}
            onChange={(e) => set("difficulty", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="q-time">
            Time limit (seconds)
          </label>
          <input
            id="q-time"
            className="input"
            type="number"
            min={30}
            step={30}
            value={draft.timeLimitSec}
            onChange={(e) => set("timeLimitSec", e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="tag tag-bad inline-block">
          {error}
        </p>
      )}
      {ok && (
        <p role="status" className="tag tag-good inline-block">
          Question saved to the assessment.
        </p>
      )}

      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save question"}
      </button>
    </form>
  );
}

export function CoursePriceEditor({
  assessmentId,
  title,
  priceMinor,
  vatMinor,
  onSaved,
}: {
  assessmentId: string;
  title: string;
  priceMinor: number;
  vatMinor: number;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(priceMinor / 100);
  const [vat, setVat] = useState(vatMinor / 100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isFree = price === 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/admin/assessments/price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          priceMinor: Math.round(price * 100),
          vatMinor: Math.round(vat * 100),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save the price.");
        setBusy(false);
        return;
      }
      setSaved(true);
      onSaved?.();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="panel mt-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Pricing</h2>
        <span className={`tag ${isFree ? "tag-good" : "tag-warn"}`}>
          {isFree ? "Free" : "Paid"}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {title} — candidates pay only for this course. Access is permanent.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="price">
            Price (KES)
          </label>
          <input
            id="price"
            className="input"
            type="number"
            min={0}
            step={50}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label" htmlFor="vat">
            VAT (KES)
          </label>
          <input
            id="vat"
            className="input"
            type="number"
            min={0}
            step={10}
            value={vat}
            onChange={(e) => setVat(Number(e.target.value))}
          />
        </div>
      </div>

      <p className="mt-3 text-sm">
        Total charged:{" "}
        <strong>
          {formatKes(Math.round(price * 100) + Math.round(vat * 100))}
        </strong>
      </p>

      {error && (
        <p role="alert" className="mt-3 tag tag-bad inline-block">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-3 tag tag-good inline-block">
          Price saved.
        </p>
      )}

      <button className="btn btn-primary mt-4" disabled={busy}>
        {busy ? "Saving…" : "Save price"}
      </button>
    </form>
  );
}
