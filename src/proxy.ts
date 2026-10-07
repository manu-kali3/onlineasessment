import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CONTACT_URL = "https://brevansoftwares.co.ke/contact-us";

/**
 * TEMPORARY — the whole site is switched off.
 *
 * To bring it back, delete this file (`src/proxy.ts`). Nothing else needs to
 * change: no page, route handler, or query reads this, it is purely a gate in
 * front of everything.
 *
 * Do not add a second file for this. Next.js allows only one proxy per project,
 * so any real proxy logic added later belongs in this file.
 *
 * The page below is deliberately self-contained: inline CSS, no <script>, no
 * external stylesheet, font, or image request, and nothing referenced from
 * /_next. That matters more than usual here — if it loaded the app's assets it
 * would be serving the very JavaScript this switch exists to withhold. There is
 * no user input anywhere in it, so there is nothing to escape or inject.
 */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Service Unavailable</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #f6f7f9;
    color: #16181d;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
                 "Helvetica Neue", Arial, sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%;
    max-width: 30rem;
    background: #fff;
    border: 1px solid #e3e5ea;
    border-radius: 16px;
    padding: 40px 32px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(16, 18, 29, .04), 0 8px 24px rgba(16, 18, 29, .06);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: .8125rem;
    font-weight: 600;
    letter-spacing: .01em;
    color: #8a5a00;
    background: #fdf3e2;
    border: 1px solid #f5e2bd;
    border-radius: 999px;
    padding: 6px 14px;
    margin-bottom: 20px;
  }
  .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #d99000;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 1.5rem;
    line-height: 1.25;
    letter-spacing: -.02em;
    font-weight: 700;
  }
  p { margin: 0 0 28px; color: #5c6270; font-size: .9375rem; }
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 13px 24px;
    background: #16181d;
    color: #fff;
    text-decoration: none;
    font-size: .9375rem;
    font-weight: 600;
    border-radius: 10px;
    border: 1px solid #16181d;
    transition: background .15s ease, transform .15s ease;
  }
  .cta:hover { background: #2b2f38; }
  .cta:active { transform: translateY(1px); }
  .cta:focus-visible { outline: 3px solid #9db4ff; outline-offset: 2px; }
  .cta svg { flex: none; }
  footer {
    margin-top: 24px;
    font-size: .8125rem;
    color: #8b909d;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0e1014; color: #edeff3; }
    .card { background: #171a20; border-color: #262a33; box-shadow: none; }
    .badge { color: #f0c67a; background: #2a2314; border-color: #40371f; }
    h1 { color: #edeff3; }
    p { color: #a2a9b8; }
    .cta { background: #edeff3; color: #12141a; border-color: #edeff3; }
    .cta:hover { background: #fff; }
    footer { color: #767d8c; }
  }
</style>
</head>
<body>
  <main class="card">
    <span class="badge"><span class="dot"></span>Temporarily unavailable</span>
    <h1>Service Unavailable</h1>
    <p>This site is not currently accessible. Please contact the provider to continue.</p>
    <a class="cta" href="${CONTACT_URL}" rel="noopener noreferrer">
      Contact Provider
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6"/>
      </svg>
    </a>
    <footer>Brevan Softwares</footer>
  </main>
</body>
</html>`;

export function proxy(_request: NextRequest) {
  return new NextResponse(PAGE, {
    // Kept at 404 as requested. 503 with Retry-After would be the more accurate
    // signal for a temporary outage; only worth changing if search indexing
    // matters more than the literal status.
    status: 404,
    headers: {
      // Explicitly uncached, so a stale 404 cannot outlive the switch.
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const config = {
  // Everything, including /_next assets and API routes. A partial matcher would
  // still serve the JavaScript that renders the app.
  matcher: "/:path*",
};