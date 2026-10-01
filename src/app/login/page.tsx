import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "candidate" ? "/candidate" : "/admin");
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <LoginForm />
    </main>
  );
}