export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { hasDatabase } from "@/lib/env";

const COPY: Record<string, { title: string; body: string; tone: string }> = {
  success: {
    title: "Email confirmed",
    body: "Your address is verified. You can sign in now.",
    tone: "tag-good",
  },
  invalid: {
    title: "Link invalid or expired",
    body: "This verification link has already been used, or it is older than 60 minutes. Request a new one.",
    tone: "tag-bad",
  },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; token?: string }>;
}) {
  if (!hasDatabase) redirect("/");

  const { status, token } = await searchParams;

  // A link carrying a token but no status means it came from an email that
  // pointed straight at this page. Consume the token here rather than sitting on
  // "pending" forever.
  if (!status && token) {
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  }

  const copy = COPY[status ?? ""] ?? {
    title: "Check your email",
    body: "Open the verification link we sent you to confirm your address. The link expires in 60 minutes.",
    tone: "tag-warn",
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="panel w-full max-w-md p-6">
        <span className={`tag ${copy.tone}`}>{status ?? "pending"}</span>
        <h1 className="mt-4 text-xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{copy.body}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/login" className="btn btn-primary">
            Go to sign in
          </Link>
          {status === "invalid" && (
            <Link href="/register" className="btn btn-ghost">
              Register again
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}