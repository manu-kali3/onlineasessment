import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { authorize } from "@/lib/api-auth";
import { hasDatabase } from "@/lib/env";

const bodySchema = z.object({
  assessmentId: z.string().min(1),
  priceMinor: z.number().int().min(0).max(10_000_000),
  vatMinor: z.number().int().min(0).max(10_000_000),
});

/**
 * Sets whether a course is free or paid, and what it costs.
 *
 * Amounts arrive as integers and are validated as non-negative. A course already
 * paid for by someone keeps their access — this only changes what future
 * candidates are asked for.
 */
export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { user, error } = await authorize("recruiter", "admin");
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Price and VAT must be non-negative amounts." },
      { status: 400 },
    );
  }

  const { assessmentId, priceMinor, vatMinor } = parsed.data;

  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  await db
    .update(assessments)
    .set({ priceMinor, vatMinor })
    .where(eq(assessments.id, assessmentId));

  return NextResponse.json({
    ok: true,
    assessmentId,
    priceMinor,
    vatMinor,
    free: priceMinor === 0,
  });
}
