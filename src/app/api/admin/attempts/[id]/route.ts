import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { loadAttemptDetail } from "@/lib/queries";

/** Per-question analytics for one attempt: time on task, edits, correctness. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser("recruiter", "assessor", "admin");

  const detail = await loadAttemptDetail(id, user.role);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}