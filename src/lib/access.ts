import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, users } from "@/db/schema";

/**
 * Site access is granted by a completed payment and is permanent.
 *
 * The check reads `users.accessGrantedAt`, which is only ever set when a payment
 * is confirmed complete — never by the client, and never optimistically when a
 * push is merely initiated.
 */
export async function hasPaidAccess(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ accessGrantedAt: users.accessGrantedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(user?.accessGrantedAt);
}

/**
 * Records a completed payment and grants access in the same statement pair.
 *
 * Guarding on `status !== 'completed'` makes this idempotent: a provider that
 * delivers the same callback twice, or two callbacks racing, cannot double-count
 * or throw.
 */
export async function grantAccessForPayment(
  paymentId: string,
): Promise<boolean> {
  const updated = await db
    .update(payments)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(payments.id, paymentId),
        // Only a pending row may transition to completed.
        eq(payments.status, "pending"),
      ),
    )
    .returning({ userId: payments.userId, externalReference: payments.externalReference });

  const row = (updated as { userId: string; externalReference: string }[])[0];
  if (!row) return false;

  await db
    .update(users)
    .set({ accessGrantedAt: new Date() })
    .where(eq(users.id, row.userId));

  return true;
}

/** Latest payment for a user, for the paywall page to display. */
export async function latestPaymentFor(userId: string) {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy((t) => [t.createdAt]);
  const list = (rows as typeof payments.$inferSelect[]) ?? [];
  return list[list.length - 1] ?? null;
}
