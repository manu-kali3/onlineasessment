export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase, env } from "@/lib/env";
import { hasPaidAccess } from "@/lib/access";
import { TopBar } from "@/components/TopBar";
import PaywallCheckout from "./PaywallCheckout";
import {
  ACCESS_PRICE_MINOR,
  ACCESS_VAT_MINOR,
  ACCESS_TOTAL_MINOR,
  formatKes,
} from "@/lib/pricing";
import { payHeroConfigured, payHeroChannelConfigured } from "@/lib/payhero";

export default async function PaywallPage() {
  if (!hasDatabase) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Already paid: send them straight through.
  if (await hasPaidAccess(user.id)) {
    redirect(user.role === "candidate" ? "/candidate" : "/admin");
  }

  const ready = payHeroConfigured() && payHeroChannelConfigured();

  return (
    <main className="min-h-dvh">
      <TopBar
        name={user.fullName}
        role={user.role}
        nav={[{ href: "/", label: "Home" }]}
      />

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <span className="tag tag-warn">Payment required</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Unlock your assessments
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Hi {user.fullName.split(" ")[0]} — one payment gives you permanent
          access to every assessment, including the proctored tests and the
          analytics a recruiter sees.
        </p>

        <section className="panel mt-6 p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Assessment access</dt>
              <dd className="font-semibold">{formatKes(ACCESS_PRICE_MINOR)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">VAT</dt>
              <dd className="font-semibold">{formatKes(ACCESS_VAT_MINOR)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--line)] pt-2 text-base">
              <dt className="font-semibold">Total to pay</dt>
              <dd className="font-bold">{formatKes(ACCESS_TOTAL_MINOR)}</dd>
            </div>
          </dl>

          {!ready ? (
            <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-4">
              <p className="text-sm font-semibold">Payments not yet configured</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                This deployment is missing{" "}
                <code className="text-xs">
                  {payHeroConfigured()
                    ? "PAYHERO_CHANNEL_ID"
                    : "PAYHERO_USERNAME / PAYHERO_PASSWORD"}
                </code>
                . Set it and redeploy; the checkout will then appear here.
              </p>
            </div>
          ) : (
            <PaywallCheckout totalMinor={ACCESS_TOTAL_MINOR} />
          )}
        </section>

        <section className="panel mt-4 p-6">
          <h2 className="text-base font-semibold">What you get</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>Every assessment you have been invited to.</li>
            <li>Unlimited attempts within each assessment's deadline.</li>
            <li>Per-question analytics and a score against the norm group.</li>
            <li>Accessibility tools: text-to-speech, high contrast, time extensions.</li>
            <li>Access is permanent — pay once.</li>
          </ul>
        </section>

        <p className="mt-6 text-xs text-[var(--muted)]">
          Payments are processed by PayHero over M-Pesa. Card details are never
          handled by this site. If payment succeeds but access does not appear,
          it can take up to a minute while the confirmation is processed —{" "}
          <a href="/" className="font-semibold text-[var(--accent)]">
            reload this page
          </a>
          .
        </p>

        {process.env.NODE_ENV !== "production" && (
          <p className="mt-4 rounded-md bg-black/5 p-3 text-xs">
            Local development: set <code>BYPASS_PAYWALL=1</code> to work on the
            app without paying. It is ignored in production.
          </p>
        )}
      </div>
    </main>
  );
}
