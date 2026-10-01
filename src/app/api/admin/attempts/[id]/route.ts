import { NextResponse } from "next/server";
import { authorize } from "@/lib/api-auth";
import { hasDatabase } from "@/lib/env";
import { loadAttemptDetail } from "@/lib/queries";

/** Per-question analytics for one attempt: time on task, edits, correctness. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasDatabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 },
    );
  }

  const { user, error } = await authorize("recruiter", "assessor", "admin");
  if (error) return error;

  const { id } = await params;
  const detail = await loadAttemptDetail(id, user.role);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}