
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessmentInvitations, assessments } from "@/db/schema";
import { requirePageUser } from "@/lib/page-auth";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import { AccessibilityControls } from "@/components/AccessibilityControls";
import { TopBar } from "@/components/TopBar";
import StartGate from "@/components/StartGate";

export const dynamic = "force-dynamic";

export default async function AssessmentStartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser("candidate");
  const [invitation] = await db
    .select()
    .from(assessmentInvitations)
    .where(
      and(
        eq(assessmentInvitations.id, id),
        eq(assessmentInvitations.candidateId, user.id),
      ),
    );
  if (!invitation) notFound();
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, invitation.assessmentId));
  if (!assessment) notFound();
  const a11y = user.accessibilityProfile ?? {};
  return (
    <AccessibilityProvider initial={a11y}>
      <TopBar
        name={user.fullName}
        role={user.role}
        nav={[{ href: "/candidate", label: "My assessments" }]}
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {assessment.title}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {assessment.description}
        </p>
        <div className="mt-5">
          <AccessibilityControls />
        </div>
        <div className="mt-5">
          <StartGate
            invitationId={invitation.id}
            resume={invitation.status === "in_progress"}
            requiresProctoring={assessment.requireProctoring}
            baseDurationMin={assessment.durationMin}
            extensionPct={a11y.timeExtensionPct ?? 0}
          />
        </div>
      </main>
    </AccessibilityProvider>
  );
}
