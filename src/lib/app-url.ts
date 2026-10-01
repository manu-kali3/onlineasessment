import { headers } from "next/headers";
import { env } from "./env";

/**
 * Resolve the public base URL for links we email (verification, password reset).
 *
 * Precedence matters because a stale or local value silently breaks the flow:
 * a candidate on a deployed instance who clicks "localhost" in their email
 * reaches nothing. So an explicitly configured production URL wins, then
 * Vercel's own domain, then the actual request host, and localhost is only used
 * as a last resort.
 */
export async function resolveAppUrl(): Promise<string> {
  const configured = (env.NEXT_PUBLIC_APP_URL ?? "").trim();

  if (configured && !isLocalHost(configured)) {
    return stripTrailingSlash(configured);
  }

  // Vercel injects this for every deployment and preview.
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${stripTrailingSlash(vercelUrl)}`;

  // Fall back to whatever host the request arrived on, honouring the proxy
  // protocol header so https is not downgraded to http.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return stripTrailingSlash(`${proto}://${host}`);
  }

  return stripTrailingSlash(configured || "http://localhost:3000");
}

function isLocalHost(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return false;
  }
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}