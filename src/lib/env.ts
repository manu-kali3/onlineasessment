import { z } from "zod";

/**
 * Validated once at import time. Deliberately lenient about DATABASE_URL:
 * `next build` imports every route module to prerender, and it must not fail
 * simply because the build machine has no database configured. The requirement
 * is enforced at query time instead — see src/db/index.ts.
 *
 * `.env.local` is loaded here for the same reason `db/index.ts` does it: CLI
 * entrypoints such as `scripts/seed.ts` run outside the Next runtime, which is
 * the only place Next injects `.env.local` automatically. Real environment
 * variables always win, so this never overrides CI or production config.
 */
if (!process.env.DATABASE_URL && typeof process !== "undefined") {
  // Synchronous on purpose: a top-level `await import()` would make this module
  // async, which breaks tooling that loads it through CommonJS (tsx/esbuild).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require("dotenv") as { config: (o: unknown) => void };
    dotenv.config({ path: ".env.local", quiet: true });
  } catch {
    // dotenv unavailable — real environment variables are used instead.
  }
}
const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z
    .string()
    .default("dev-only-insecure-secret-change-me-now-please-change"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  ATS_WEBHOOK_SECRET: z.string().default("dev-ats-secret"),
  PROCTORING_WEBHOOK_SECRET: z.string().default("dev-proctor-secret"),
  /** Resend API key. Without it, mail is logged to the console instead of sent. */
  RESEND_API_KEY: z.string().optional(),
  /** Verified sending domain, e.g. "assessment.example.com". */
  /**
   * Verified sending address. This must be on a domain you have verified in
   * Resend. `onboarding@resend.dev` is a test-only address restricted to the
   * account owner and will not pass SPF/DKIM for real candidates.
   */
  RESEND_FROM: z
    .string()
    .default("Assessment Center <no-reply@brevansoftwares.co.ke>"),
  /** PayHero API credentials. Server-only; never exposed to the browser. */
  PAYHERO_USERNAME: z.string().optional(),
  PAYHERO_PASSWORD: z.string().optional(),
  PAYHERO_ACCOUNT_ID: z.string().optional(),
  /**
   * The PayHero channel that routes money to a specific paybill/till. Required
   * for an STK push but not for the rest of the portal, so it stays optional
   * here rather than breaking every other route when it is absent.
   */
  PAYHERO_CHANNEL_ID: z.string().optional(),
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

/**
 * Outbound email is optional. In development we fall back to logging the
 * message so password-reset links are still reachable without a paid account.
 */
export const canSendEmail = Boolean(env.RESEND_API_KEY);

/** In production a real secret must be supplied, not the development default. */
if (process.env.NODE_ENV === "production") {
  if (env.AUTH_SECRET.startsWith("dev-only-insecure")) {
    console.warn(
      "[env] AUTH_SECRET is still the development default. Set a unique 32+ character secret before serving real candidates.",
    );
  }
}