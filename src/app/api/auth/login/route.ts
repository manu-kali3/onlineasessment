import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword, createSession } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  if (!hasDatabase) {
    return NextResponse.json(
      { error: "Sign-in is unavailable: the database is not configured." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));

  // Same message for unknown user and wrong password to avoid account enumeration
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 },
    );
  }

  await createSession({ id: user.id, role: user.role, email: user.email });
  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect:
      user.role === "candidate" ? "/candidate" : "/admin",
  });
}