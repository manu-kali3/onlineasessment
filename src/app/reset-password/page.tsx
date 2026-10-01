export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { hasDatabase } from "@/lib/env";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (!hasDatabase) redirect("/");

  const { token } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <ResetPasswordForm token={token ?? ""} />
    </main>
  );
}