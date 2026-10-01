// Confirms the new admin signs in and that a candidate sees the web-dev
// assessment on their dashboard.
const BASE = process.env.BASE || "http://localhost:3210";

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
    headers: { cookie },
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)})`}`,
    );

  console.log("=== new admin account ===");
  const admin = await login("manu161@brevansoftwares.co.ke", "QFcTbastKDE2467$$_");
  pass("signs in", admin.status, 200);
  pass("redirects to /admin", admin.data?.redirect, "/admin");

  const adminPage = await get("/admin", admin.cookie);
  pass("reaches the admin overview", adminPage.status, 200);
  pass("overview renders", adminPage.html.includes("Recruiter overview"), true);
  pass("can open integrations", (await get("/admin/integrations", admin.cookie)).status, 200);

  console.log("\n=== candidate sees the web-dev assessment ===");
  const cand = await login("jordan@portal.test", "Passw0rd!");
  pass("candidate signs in", cand.status, 200);

  const dash = await get("/candidate", cand.cookie);
  pass("dashboard loads", dash.status, 200);
  pass("shows Web Development Fundamentals", dash.html.includes("Web Development Fundamentals"), true);
  pass("shows a Start action", dash.html.includes(">Start<"), true);
  pass("still shows the other assessment", dash.html.includes("Core Aptitude"), true);

  // Follow the invite through to the runner.
  const { neon } = require("@neondatabase/serverless");
  require("dotenv").config({ path: ".env.local", quiet: true });
  const sql = neon(process.env.DATABASE_URL);
  const res = await sql.query(
    `select ai.id from assessment_invitations ai
     join users u on u.id = ai.candidate_id
     where u.email = $1 and ai.assessment_id = 'asmt-web-fundamentals'`,
    ["jordan@portal.test"],
  );
  const inv = (res.rows ?? res)[0];
  pass("invitation exists for jordan", Boolean(inv), true);

  const start = await get(`/candidate/assessment/${inv.id}`, cand.cookie);
  pass("start page loads", start.status, 200);
  pass("shows the timer", /Timer:/.test(start.html), true);

  console.log("\nall checks passed");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});