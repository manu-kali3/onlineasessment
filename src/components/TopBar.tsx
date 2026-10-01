"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function TopBar({
  name,
  role,
  nav,
}: {
  name: string;
  role: string;
  nav: { href: string; label: string }[];
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-[var(--line)] bg-[var(--panel)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
        <Link href="/" className="text-sm font-bold tracking-tight">
          Assessment Center
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-black/5 hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="tag capitalize">{role}</span>
          <span className="hidden text-sm font-medium sm:inline">{name}</span>
          <button onClick={logout} className="btn btn-ghost !py-1 !px-2 !text-xs">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}