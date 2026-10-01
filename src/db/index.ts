import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Neon is Postgres over HTTP, so we use the serverless driver (no persistent TCP
 * socket). Safe to call at module scope in server components and route handlers.
 */
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
export { schema };