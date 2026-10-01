import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/env";

/**
 * Every database-backed route handler needs the same two guards before it can
 * touch the schema: a configured connection, and an authenticated candidate.
 * Returning them from one helper stops handlers from drifting apart.
 */
export function databaseUnavailable() {
  return hasDatabase
    ? null
    : NextResponse.json(
        { error: "Database not configured" },
        { status: 503 },
      );
}