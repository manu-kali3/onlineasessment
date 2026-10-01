export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (!hasDatabase) {
    // Without a database there are no credentials to check against, so send
    // the visitor to the setup notice on the home page instead of failing.
    redirect("/");
  }

  const user = await getCurrentUser();
  if (user) redirect(user.role === "candidate" ? "/candidate" : "/admin");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <LoginForm />
    </main>
  );
}