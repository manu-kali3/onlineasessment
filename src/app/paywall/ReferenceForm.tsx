"use client";

import { useState } from "react";

/**
 * Submits a payment reference for manual verification.
 *
 * The copy is explicit that this does not grant access by itself: an M-Pesa
 * confirmation code is not secret, so a candidate pasting one proves nothing
 * until an admin matches it against a real notification.
 */
export default function ReferenceForm({ assessmentId }: { assessmentId: string }) {
  const [code, setCode] = useState("");
  const [channel, setChannel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const res = await fetch("/api/payments/reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          referenceCode: code,
          channel: channel || undefined,
          amountMinor: amount ? Math.round(Number(amount) * 100) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not submit the reference.");
        return;
      }
      setNote(data.message);
      setCode("");
      setChannel("");
      setAmount("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label className="label" htmlFor="ref-code">
          Confirmation code
        </label>
        <input
          id="ref-code"
          className="input font-mono"
          placeholder="e.g. QGH7X2K9LM"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ref-channel">
            Paid via <span className="font-normal">(optional)</span>
          </label>
          <input
            id="ref-channel"
            className="input"
            placeholder="M-Pesa, bank transfer…"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="ref-amount">
            Amount (KES) <span className="font-normal">(optional)</span>
          </label>
          <input
            id="ref-amount"
            className="input"
            type="number"
            min={0}
            step="0.01"
            placeholder="1050.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="tag tag-bad inline-block">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="tag tag-good inline-block">
          {note}
        </p>
      )}

      <button className="btn btn-ghost" disabled={busy}>
        {busy ? "Submitting…" : "Submit for verification"}
      </button>

      <p className="text-xs text-[var(--muted)]">
        Submitting a code does not unlock the course by itself. An admin checks it
        against the payment notification before access is granted.
      </p>
    </form>
  );
}
