export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { hasDatabase } from "@/lib/env";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  if (!hasDatabase) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <ForgotPasswordForm />
    </main>
  );
}