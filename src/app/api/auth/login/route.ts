import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword, createSession } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";

/** Cap on request body before JSON parsing, to limit memory use per request. */
const MAX_BODY_BYTES = 4_096;

/**
 * A real bcrypt hash of an unguessable string, compared against when the email
 * is unknown so that a miss costs roughly the same wall time as a wrong
 * password and cannot be distinguished by timing. The plaintext is discarded;
 * no credential can authenticate against it.
 */
const DUMMY_HASH =
  "$2b$12$t1VuQsYwiiBudKhQG5nzMOL8CrUYjQz7tqiOAMYGmEuGy/mJL0W0y";

const bodySchema = z.object({
  email: z.string().email().max(254),
  // bcrypt silently truncates beyond 72 bytes, so cap it rather than let a
  // caller believe a longer passphrase is fully checked.
  password: z.string().min(1).max(72),
});

export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json(
      { error: "Sign-in is unavailable: the database is not configured." },
      { status: 503 },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));

  // One generic message for both unknown user and wrong password, so the
  // endpoint cannot be used to discover which emails have accounts.
  // Verify against a dummy hash when the user is absent to keep the timing of
  // the two branches similar.
  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 },
    );
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 },
    );
  }

  await createSession({ id: user.id, role: user.role, email: user.email });
  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: user.role === "candidate" ? "/candidate" : "/admin",
  });
}