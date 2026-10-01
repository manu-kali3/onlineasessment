import type { Metadata } from "next";
import "./globals.css";

/**
 * No `next/font/google` here on purpose: it downloads the font binary during
 * `next build`, which fails the whole build when the build machine has no
 * outbound network access. A system font stack renders instantly and keeps
 * CI and offline builds deterministic.
 */
export const metadata: Metadata = {
  title: "Assessment Center",
  description:
    "Virtual assessment center for candidates, recruiters, and assessors.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}