// End-to-end smoke test with fetch, which sends cookie headers predictably.
const BASE = process.env.BASE || "http://localhost:3120";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookie = raw.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, body, cookie };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, location: res.headers.get("location"), html };
}

const checks = [
  ["landing page", "/", "Assessment Center"],
];

async function main() {
  console.log("=== anonymous ===");
  for (const [name, path, needle] of checks) {
    const r = await get(path, "");
    console.log(`${name}: ${r.status} contains "${needle}": ${r.html.includes(needle)}`);
  }

  const anon = await get("/candidate", "");
  console.log(`/candidate anonymous: ${anon.status} -> ${anon.location}`);

  console.log("\n=== candidate ===");
  const c = await login("candidate@portal.test", "Passw0rd!");
  console.log(`login: ${c.status} ${JSON.stringify(c.body)}`);
  console.log(`cookie present: ${Boolean(c.cookie)}`);
  if (c.cookie) {
    const dash = await get("/candidate", c.cookie);
    console.log(`/candidate: ${dash.status} -> ${dash.location ?? "(no redirect)"}`);
    console.log(`  lists assessment: ${dash.html.includes("Core Aptitude Battery")}`);
    console.log(`  lists 2nd assessment: ${dash.html.includes("Leadership")}`);
    console.log(`  has a11y controls: ${dash.html.includes("Text to speech")}`);
    console.log(`  shows Start: ${dash.html.includes(">Start<") || dash.html.includes(">Resume<")}`);

    const results = await get("/candidate/results/att-3", c.cookie);
    console.log(
      `/candidate/results/att-3 (other candidate's attempt): ${results.status}`,
    );
  }

  console.log("\n=== recruiter ===");
  const r = await login("recruiter@portal.test", "Passw0rd!");
  console.log(`login: ${r.status} ${JSON.stringify(r.body)}`);
  const admin = await get("/admin", r.cookie);
  console.log(`/admin: ${admin.status} -> ${admin.location ?? "(no redirect)"}`);
  console.log(`  has overview: ${admin.html.includes("Recruiter overview")}`);
  console.log(`  has risk queue: ${admin.html.includes("Integrity risk queue")}`);
  console.log(`  shows assessment: ${admin.html.includes("Core Aptitude Battery")}`);

  console.log("\n=== admin (identities visible) ===");
  const a = await login("admin@portal.test", "Passw0rd!");
  const analytics = await get("/admin/analytics", a.cookie);
  console.log(
    `/admin/analytics: ${analytics.status} identities visible: ${analytics.html.includes("Casey Candidate") || analytics.html.includes("Jordan") || analytics.html.includes("Priya")}`,
  );

  console.log("\n=== role separation ===");
  const adminAsCandidate = await get("/admin/integrations", c.cookie);
  console.log(
    `candidate hitting /admin/integrations: ${adminAsCandidate.status} -> ${adminAsCandidate.location}`,
  );
  const recruiterAsCandidate = await get("/candidate", r.cookie);
  console.log(
    `recruiter hitting /candidate: ${recruiterAsCandidate.status} -> ${recruiterAsCandidate.location}`,
  );

  console.log("\n=== anonymous API access ===");
  const anonApi = await fetch(`${BASE}/api/attempts/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attemptId: "att-1" }),
  });
  console.log(`submit without auth: ${anonApi.status}`);
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});