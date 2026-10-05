export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";
import { canAccessCourse } from "@/lib/access";
import { TopBar } from "@/components/TopBar";
import CourseCheckout from "./CourseCheckout";
import {
  ACCESS_PRICE_MINOR,
  ACCESS_VAT_MINOR,
  formatKes,
} from "@/lib/pricing";
import { payHeroConfigured, payHeroChannelConfigured } from "@/lib/payhero";

export default async function PaywallPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  if (!hasDatabase) redirect("/");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { course } = await searchParams;

  // No course in the URL means the caller wants the general paywall. With
  // per-course pricing there is nothing to buy globally, so send them to their
  // dashboard where the per-course buttons live.
  if (!course) {
    redirect(user.role === "candidate" ? "/candidate" : "/admin");
  }

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, course));

  if (!assessment) redirect("/candidate");

  // Free courses never need this page.
  if (assessment.priceMinor === 0) redirect("/candidate");

  if (await canAccessCourse(user.id, course)) {
    redirect("/candidate");
  }

  const ready = payHeroConfigured() && payHeroChannelConfigured();
  const vatMinor = assessment.vatMinor ?? 0;
  const totalMinor = assessment.priceMinor + vatMinor;

  return (
    <main className="min-h-dvh">
      <TopBar
        name={user.fullName}
        role={user.role}
        nav={[{ href: "/candidate", label: "My assessments" }]}
      />

      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <span className="tag tag-warn">Payment required</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          {assessment.title}
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          This course is paid. One payment gives you permanent access to it.
        </p>

        <section className="panel mt-6 p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Course access</dt>
              <dd className="font-semibold">{formatKes(assessment.priceMinor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">VAT</dt>
              <dd className="font-semibold">{formatKes(vatMinor)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--line)] pt-2 text-base">
              <dt className="font-semibold">Total to pay</dt>
              <dd className="font-bold">{formatKes(totalMinor)}</dd>
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
            <CourseCheckout
              assessmentId={assessment.id}
              totalMinor={totalMinor}
            />
          )}
        </section>

        <p className="mt-6 text-xs text-[var(--muted)]">
          Payments are processed by PayHero over M-Pesa. Card details are never
          handled by this site. If payment succeeds but access does not appear, it
          can take up to a minute while the confirmation is processed —{" "}
          <a href="/candidate" className="font-semibold text-[var(--accent)]">
            reload this page
          </a>
          .
        </p>
      </div>
    </main>
  );
}
