import type { Config } from "drizzle-kit";
import "dotenv/config";

/**
 * CLI tools read process.env, and Next loads `.env.local` only inside the app
 * runtime. So for `db:*` scripts we source `.env.local` explicitly.
 */
if (!process.env.DATABASE_URL) {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
} satisfies Config;