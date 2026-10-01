import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32).default("dev-only-insecure-secret-change-me-now"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  ATS_WEBHOOK_SECRET: z.string().default("dev-ats-secret"),
  PROCTORING_WEBHOOK_SECRET: z.string().default("dev-proctor-secret"),
});

export const env = envSchema.parse(process.env);