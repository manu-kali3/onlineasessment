import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { hasDatabase } from "@/lib/env";

/**
 * Neon is Postgres over HTTP, so we use the serverless driver — no persistent
 * TCP socket, which keeps it compatible with serverless runtimes.
 *
 * `next build` imports every route module while prerendering, and a build
 * machine has no database credentials. So the client is constructed with a
 * placeholder and `requireDatabase()` guards the actual queries.
 */
const sql = neon(
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/not-configured",
);

export const db = drizzle(sql, { schema });
export { schema };

/** Call at the top of any handler or page that will actually hit the database. */
export function requireDatabase() {
  if (!hasDatabase) {
    throw new Error(
      "DATABASE_URL is not configured. Add your Neon connection string to .env.local (see .env.example).",
    );
  }
}