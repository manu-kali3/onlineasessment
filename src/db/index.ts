import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { hasDatabase } from "@/lib/env";

/**
 * Neon is Postgres over HTTP, so we use the serverless driver — no persistent
 * TCP socket, which keeps it compatible with serverless runtimes.
 *
 * Two things matter here:
 *
 * 1. `next build` imports every route module while prerendering, and a build
 *    machine has no database credentials. So the client is created with a
 *    syntactically valid placeholder rather than throwing at import time.
 *    `hasDatabase` gates the queries that would actually need a connection.
 *
 * 2. CLI entrypoints (`tsx scripts/seed.ts`) run outside Next, so `.env.local`
 *    is not injected automatically. Load it here when the variable is absent.
 */
if (!process.env.DATABASE_URL && typeof process !== "undefined") {
  // Only meaningful outside Next; harmless if the file is missing. Synchronous
  // so this module stays loadable through CommonJS by tsx/esbuild.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require("dotenv") as { config: (o: unknown) => void };
    dotenv.config({ path: ".env.local", quiet: true });
  } catch {
    // dotenv unavailable — the placeholder client is used instead.
  }
}

const PLACEHOLDER = "postgresql://user:password@localhost:5432/unconfigured";

const sql = neon(process.env.DATABASE_URL ?? PLACEHOLDER);

export const db = drizzle(sql, { schema });
export { schema };

/** Call at the top of anything that will actually query, for a clear message. */
export function requireDatabase() {
  if (!hasDatabase) {
    throw new Error(
      "DATABASE_URL is not configured. Add your Neon connection string to .env.local (see .env.example).",
    );
  }
}