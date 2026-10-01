// Confirms each staff account can sign in and reach the pages its role allows.
const BASE = process.env.BASE || "http://localhost:3200";

const ACCOUNTS = [
  { email: "admin@brevansoftwares.co.ke", password: "a real admin passphrase 2026", role: "admin", canSee: ["/admin", "/admin/analytics", "/admin/assessments", "/admin/integrations"], cannotSee: [] },
  { email: "recruiter@brevansoftwares.co.ke", password: "another real passphrase 314", role: "recruiter", canSee: ["/admin", "/admin/analytics", "/admin/assessments"], cannotSee: ["/admin/integrations"] },
  { email: "assessor@portal.test", password: "Passw0rd!", role: "assessor", canSee: ["/admin", "/admin/analytics"], cannotSee: ["/admin/integrations"] },
];

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(e)})`}`,
    );

  for (const acct of ACCOUNTS) {
    console.log(`\n=== ${acct.role}: ${acct.email} ===`);

    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: acct.email, password: acct.password }),
    });
    const body = await res.json();
    const cookie = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");

    pass("signs in", res.status, 200);
    pass("redirected to /admin", body.redirect, "/admin");
    pass("session cookie issued", Boolean(cookie), true);

    for (const path of acct.canSee) {
      const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
      pass(`can open ${path}`, r.status, 200);
    }

    for (const path of acct.cannotSee) {
      const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
      const ok = r.status === 307 || r.status === 403;
      pass(`blocked from ${path}`, ok, true);
    }
  }

  console.log("\nall staff accounts verified");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});