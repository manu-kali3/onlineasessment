"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close the menu on navigation, otherwise it stays open across pages.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes it, and a click outside does too. Both are expected on mobile.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Lock body scroll while the sheet covers the page.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--panel)]">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-sm font-bold tracking-tight"
          aria-label="Assessment Center home"
        >
          Assessment Center
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-black/5 text-[var(--ink)]"
                  : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--ink)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <span className="tag capitalize">{role}</span>
          <span className="text-sm font-medium">{name}</span>
          <button onClick={logout} className="btn btn-ghost !py-1 !px-2 !text-xs">
            Sign out
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="btn btn-ghost ml-auto !px-2 md:hidden"
        >
          <span aria-hidden="true" className="relative block h-4 w-5">
            <span
              className={`absolute left-0 block h-0.5 w-5 bg-current transition-transform duration-200 ${
                open ? "top-1.5 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 block h-0.5 w-5 bg-current transition-opacity duration-200 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 block h-0.5 w-5 bg-current transition-transform duration-200 ${
                open ? "top-1.5 -rotate-45" : "top-3"
              }`}
            />
          </span>
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div
          id="mobile-nav"
          ref={panelRef}
          className="border-t border-[var(--line)] bg-[var(--panel)] md:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <ul className="flex flex-col">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`block rounded-md px-3 py-3 text-base font-medium ${
                      isActive(item.href)
                        ? "bg-black/5 text-[var(--ink)]"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <span className="tag mt-1 capitalize">{role}</span>
              </div>
              <button onClick={logout} className="btn btn-ghost !text-sm">
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}