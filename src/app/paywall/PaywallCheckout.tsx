"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatKes } from "@/lib/pricing";

type Phase =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "waiting" }
  | { state: "polling" }
  | { state: "error"; message: string };

export default function PaywallCheckout({
  totalMinor,
}: {
  totalMinor: number;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);

  const pending = phase.state === "starting" || phase.state === "waiting" || phase.state === "polling";

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase({ state: "starting" });

    let res: Response;
    try {
      res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });
    } catch {
      setPhase({ state: "error", message: "Network error. Please try again." });
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setPhase({ state: "error", message: data.error ?? "Could not start the payment." });
      return;
    }

    setPhase({ state: "waiting" });

    // Access is only granted once the provider confirms payment, so poll until
    // the webhook has landed. 4 minutes covers a customer walking to their phone.
    const deadline = Date.now() + 4 * 60_000;
    let interval = 1200;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));
      setPhase({ state: "polling" });
      interval = Math.min(interval * 1.15, 5000);

      try {
        // router.refresh() re-runs the server guard, which redirects away from
        // /paywall once access is granted.
        const check = await fetch("/api/payments/status", {
          cache: "no-store",
        });
        const state = await check.json().catch(() => ({}));

        if (state.paid) {
          router.refresh();
          router.push("/candidate");
          return;
        }
      } catch {
        // Keep polling; a transient failure is not a reason to stop.
      }
    }

    setPhase({
      state: "error",
      message:
        "Still waiting on the payment confirmation. If you were charged, access is granted automatically — reload this page in a minute.",
    });
  }

  useEffect(() => {
    if (phase.state === "error") setError(phase.message);
  }, [phase]);

  return (
    <form onSubmit={pay} className="mt-5">
      <label className="label" htmlFor="phone">
        M-Pesa phone number
      </label>
      <input
        id="phone"
        className="input"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0712 345 678"
        required
        disabled={pending}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <p className="mt-1 text-xs text-[var(--muted)]">
        You will receive an STK prompt. Enter your PIN to pay {formatKes(totalMinor)}.
      </p>

      {error && (
        <p role="alert" className="mt-4 tag tag-bad inline-block">
          {error}
        </p>
      )}

      {pending && (
        <p role="status" className="mt-4 rounded-md bg-black/5 p-3 text-sm">
          {phase.state === "starting" && "Sending your M-Pesa prompt…"}
          {phase.state === "waiting" &&
            "Check your phone for the M-Pesa prompt and enter your PIN."}
          {phase.state === "polling" &&
            "Waiting for payment confirmation… keep this page open."}
        </p>
      )}

      <button className="btn btn-primary mt-5 w-full" disabled={pending}>
        {pending ? "Waiting for payment…" : `Pay ${formatKes(totalMinor)}`}
      </button>
    </form>
  );
}
