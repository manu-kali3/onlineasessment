import { z } from "zod";

/**
 * Validated once at import time. Deliberately lenient about DATABASE_URL:
 * `next build` imports every route module to prerender, and it must not fail
 * simply because the build machine has no database configured. The requirement
 * is enforced at query time instead — see src/db/index.ts.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z
    .string()
    .default("dev-only-insecure-secret-change-me-now-please-change")
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  ATS_WEBHOOK_SECRET: z.string().default("dev-ats-secret"),
  PROCTORING_WEBHOOK_SECRET: z.string().default("dev-proctor-secret"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration — ${detail}`);
}

export const env = parsed.data;

export const hasDatabase = Boolean(env.DATABASE_URL);

/** In production a real secret must be supplied, not the development default. */
if (process.env.NODE_ENV === "production") {
  if (env.AUTH_SECRET.startsWith("dev-only-insecure")) {
    console.warn(
      "[env] AUTH_SECRET is still the development default. Set a unique 32+ character secret before serving real candidates.",
    );
  }
}