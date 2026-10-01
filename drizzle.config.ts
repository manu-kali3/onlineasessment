import type { Config } from "drizzle-kit";
import { config } from "dotenv";

/**
 * CLI tools read `process.env` directly, and Next only injects `.env.local`
 * inside the app runtime. So for `db:*` scripts we load it explicitly here.
 * Precedence: real env vars (CI/Vercel) win over the local file.
 */
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (see .env.example) before running drizzle-kit.",
  );
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
} satisfies Config;