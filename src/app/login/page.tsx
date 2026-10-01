
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase, canSendEmail } from "@/lib/env";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!hasDatabase) {
    // Without a database there are no credentials to check against, so send
    // the visitor to the setup notice on the home page instead of failing.
    redirect("/");
  }

  const user = await getCurrentUser();
  if (user) redirect(user.role === "candidate" ? "/candidate" : "/admin");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-12">
      {/*
        Without a sending key every verification and reset email is logged
        instead of sent, so candidates are told to check an inbox that will never
        receive anything. Say so on the page where they would hit it.
      */}
      {!canSendEmail && (
        <div className="panel w-full max-w-sm border-[var(--warn)] p-4">
          <span className="tag tag-warn">Email not configured</span>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This deployment has no <code>RESEND_API_KEY</code>, so verification
            and password reset emails are not actually sent. Set it in the
            environment to restore them.
          </p>
        </div>
      )}
      <LoginForm />
    </main>
  );
}
