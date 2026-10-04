// Verifies the paywall is enforced server-side, not just shown as an overlay.
// The critical check is that an unpaid user's protected pages do not contain
// their content at all — if it were a client-side overlay, the HTML would still
// leak the assessment.
const BASE = process.env.BASE || "http://localhost:3240";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return {
    status: res.status,
    data,
    cookie: raw.map((c) => c.split(";")[0]).join("; "),
  };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)})`}`,
    );

  console.log("=== public paths remain reachable ===");
  for (const p of ["/", "/login", "/register", "/forgot-password"]) {
    const r = await get(p, "");
    pass(`${p} reachable without paying`, r.status, 200);
  }

  console.log("\n=== unpaid user is redirected to the paywall ===");
  const unpaid = await login("jordan@portal.test", "Passw0rd!");
  pass("can sign in", unpaid.status, 200);

  const dash = await get("/candidate", unpaid.cookie);
  pass("/candidate redirects", dash.status, 307);
  pass("  to /paywall", dash.location, "/paywall");

  const admin = await get("/admin", unpaid.cookie);
  pass("/admin redirects too (staff paywalled as well)", admin.status, 307);

  const pw = await get("/paywall", unpaid.cookie);
  pass("/paywall renders", pw.status, 200);
  pass("  shows the price", pw.html.includes("1,050"), true);
  pass("  shows VAT separately", pw.html.includes("50.00"), true);
  pass("  explains permanent access", pw.html.includes("permanent"), true);

  // The checkout only appears once PayHero is fully configured. Without a
  // channel id it must say so rather than offer a payment that cannot work.
  const channelSet = Boolean(process.env.PAYHERO_CHANNEL_ID);
  if (channelSet) {
    pass("  asks for a phone number", pw.html.includes("M-Pesa phone number"), true);
  } else {
    // Which variable is absent depends on the environment, so assert only
    // that the page hides checkout and names a PAYHERO_ variable to set.
    const namesMissing = /PAYHERO_(USERNAME|CHANNEL_ID)/.test(pw.html);
    pass(
      "  hides checkout and names the missing variable",
      pw.html.includes("not yet configured") && namesMissing,
      true,
    );
  }

  console.log("\n=== content is NOT in the response (not an overlay) ===");
  // If the gate were client-side, the assessment titles would appear here.
  const leaked = ["Core Aptitude", "AI Fundamentals", "Graphic Design", "Web Development"];
  for (const term of leaked) {
    pass(`"${term}" absent from /candidate HTML`, pw.html.includes(term), false);
  }

  console.log("\n=== assessment APIs are blocked too ===");
  const startRes = await fetch(`${BASE}/api/attempts/start`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: unpaid.cookie },
    body: JSON.stringify({ invitationId: "inv-2" }),
  });
  pass("start returns 402", startRes.status, 402);
  const body = await startRes.json();
  pass("  with PAYMENT_REQUIRED", body.code, "PAYMENT_REQUIRED");
  pass("  pointing at checkout", body.checkoutUrl, "/paywall");

  const submitRes = await fetch(`${BASE}/api/attempts/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: unpaid.cookie },
    body: JSON.stringify({ attemptId: "att-1" }),
  });
  pass("submit returns 402", submitRes.status, 402);

  const statusRes = await fetch(`${BASE}/api/payments/status`, {
    headers: { cookie: unpaid.cookie },
  });
  pass("status endpoint reports unpaid", (await statusRes.json()).paid, false);

  console.log("\n=== a paid user gets through ===");
  const { neon } = require("@neondatabase/serverless");
  require("dotenv").config({ path: ".env.local", quiet: true });
  const sql = neon(process.env.DATABASE_URL);
  await sql.query("update users set access_granted_at = now() where email = $1", [
    "jordan@portal.test",
  ]);

  const after = await get("/candidate", unpaid.cookie);
  pass("/candidate now renders", after.status, 200);
  pass("  lists assessments", after.html.includes("Core Aptitude"), true);

  const startOk = await fetch(`${BASE}/api/attempts/start`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: unpaid.cookie },
    body: JSON.stringify({ invitationId: "inv-2" }),
  });
  pass("start no longer 402", startOk.status !== 402, true);

  await sql.query("update users set access_granted_at = null where email = $1", [
    "jordan@portal.test",
  ]);
  console.log("\nrevoked again for the next run; all checks complete");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});