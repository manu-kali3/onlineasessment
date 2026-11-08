export const dynamic = "force-dynamic";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, paymentReferences, users } from "@/db/schema";
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import ReferenceQueue from "@/components/ReferenceQueue";
import { adminNav } from "@/lib/admin-nav";
import { Tag } from "@/components/admin/ui";

export default async function AdminPaymentsPage() {
  const user = await requirePageUser("recruiter", "admin");

  const rows = await db
    .select({
      id: paymentReferences.id,
      referenceCode: paymentReferences.referenceCode,
      channel: paymentReferences.channel,
      amountMinor: paymentReferences.amountMinor,
      status: paymentReferences.status,
      createdAt: paymentReferences.createdAt,
      assessmentTitle: assessments.title,
      candidateName: users.fullName,
      candidateEmail: users.email,
    })
    .from(paymentReferences)
    .innerJoin(assessments, eq(assessments.id, paymentReferences.assessmentId))
    .innerJoin(users, eq(users.id, paymentReferences.userId))
    .orderBy(desc(paymentReferences.createdAt));

  return (
    <main className="min-h-dvh">
      <TopBar name={user.fullName} role={user.role} nav={adminNav} />

      <div className="mx-auto w-full max-w-4xl px-4 pt-7 pb-16 sm:px-6">
        <div className="section-head">
          <div>
            <h1 className="page-title">Payment references</h1>
            <p className="page-sub">
              Customers who paid the paybill or bank account directly paste their
              confirmation code instead of paying through the portal.
            </p>
          </div>
          <Tag tone="warn">Verify against the real notification</Tag>
        </div>

        {/*
          This warning is the whole point of the screen: an M-Pesa confirmation
          code is not a secret, so a submitted code proves nothing on its own.
          It gets a banner rather than a line of body text.
        */}
        <div className="banner banner-warn mt-4">
          <span className="mt-0.5 shrink-0 text-[var(--warn)]">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            >
              <path d="M12 8.5v5M12 17h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <span>
            <span className="font-semibold">A code proves nothing by itself.</span>{" "}
            Anyone who has paid you has seen one, and the format is well known.
            Match every row against the bank or M-Pesa notification before
            clicking verify — that click grants course access and there is no
            undo.
          </span>
        </div>

        <ReferenceQueue
          rows={rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}