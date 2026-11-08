export const dynamic = "force-dynamic";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, paymentReferences, users } from "@/db/schema";
import { requirePageUser } from "@/lib/page-auth";
import { TopBar } from "@/components/TopBar";
import ReferenceQueue from "@/components/ReferenceQueue";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/assessments", label: "Assessments" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/integrations", label: "Integrations" },
];

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
        <h1 className="page-title">Payment references</h1>
        <p className="page-sub">
          Customers who paid the paybill or bank account directly paste their
          confirmation code instead of paying through the portal. Check each one
          against the real payment notification before verifying — the code alone
          proves nothing.
        </p>

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