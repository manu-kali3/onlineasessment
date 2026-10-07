import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * TEMPORARY — the whole site is switched off and returns 404.
 *
 * To bring it back, delete this file (`src/proxy.ts`). Nothing else needs to
 * change: no page, route handler, or query reads this, it is purely a gate in
 * front of everything.
 *
 * Do not "improve" this into a branded maintenance page. A plain 404 with no HTML
 * shell means no JavaScript is served or executed at all, so nothing can render
 * and nothing leaks. A styled placeholder would reintroduce the surface this is
 * here to remove.
 *
 * This replaces `middleware.ts`, which Next.js 16 deprecated in favour of this
 * filename. Note there is only ever one proxy file per project, so if you add
 * real proxy logic later it belongs in this file, not a second one.
 */
export function proxy(_request: NextRequest) {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      // Explicitly uncached, so a stale 404 cannot outlive the switch.
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export const config = {
  // Everything, including /_next assets and API routes. A partial matcher would
  // still serve the JavaScript that renders the app.
  matcher: "/:path*",
};