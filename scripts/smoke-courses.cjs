// Verifies per-course pricing end to end: free courses start immediately, paid
// courses route to the per-course checkout, and the admin authoring tools work.
const BASE = process.env.BASE || "http://localhost:3280";
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = require("./lib/db.cjs").withRetry(neon(process.env.DATABASE_URL));

const rows = (r) => r.rows ?? r;

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

  const cand = await login("jordan@portal.test", "Passw0rd!");
  pass("candidate signs in", cand.status, 200);

  const dash = await get("/candidate", cand.cookie);
  pass("dashboard renders", dash.status, 200);
  pass("shows a Free badge", dash.html.includes(">Free<"), true);
  pass("shows a paid price badge", /tag tag-warn/.test(dash.html), true);

  // Find the paid course and confirm it routes to the per-course paywall.
  const paid = rows(
    await sql.query(
      "select id, title, price_minor, vat_minor from assessments where price_minor > 0 and status = 'published' limit 1",
    ),
  )[0];

  if (!paid) {
    console.log("\nSKIP  no paid course seeded — set one via the admin pricing form");
    return;
  }

  console.log(`\npaid course: ${paid.title} (${paid.price_minor / 100} + ${(paid.vat_minor ?? 0) / 100} VAT)`);

  const inv = rows(
    await sql.query(
      `select ai.id from assessment_invitations ai
       where ai.candidate_id in (select id from users where email = $1)
         and ai.assessment_id = $2`,
      ["jordan@portal.test", paid.id],
    ),
  )[0];

  if (!inv) {
    console.log("SKIP  candidate not invited to the paid course");
    return;
  }

  const start = await get(`/candidate/assessment/${inv.id}`, cand.cookie);
  pass("start page loads", start.status, 200);

  // The price and checkout live on the per-course paywall, not the pre-flight
  // screen, which only shows the timer and consent.
  const paywall = await get(`/paywall?course=${paid.id}`, cand.cookie);
  pass("per-course paywall renders", paywall.status, 200);
  pass("shows the price", paywall.html.includes("Total to pay"), true);
  pass("asks for a phone number", paywall.html.includes("M-Pesa phone number"), true);

  // The attempt APIs refuse before payment, so no attempt is ever created and the
  // runner is unreachable. That is stronger than redirecting the runner page: the
  // page gate alone would still leave the API open to a direct call.
  const started = await fetch(`${BASE}/api/attempts/start`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cand.cookie },
    body: JSON.stringify({ invitationId: inv.id }),
  });
  const attempt = await started.json();
  pass("start refused for unpaid candidate", started.status, 402);
  pass("  with PAYMENT_REQUIRED", attempt.code, "PAYMENT_REQUIRED");
  pass("  pointing at checkout", attempt.checkoutUrl, `/paywall?course=${paid.id}`);
  pass("  no attempt issued", attempt.attemptId, undefined);

  // ---- admin authoring ----
  console.log("\n=== admin authoring ===");
  const admin = await login(
    "manu161@brevansoftwares.co.ke",
    process.env.GRANT_ADMIN_PASSWORD,
  );
  if (!process.env.GRANT_ADMIN_PASSWORD) {
    console.log("SKIP  admin authoring — set GRANT_ADMIN_PASSWORD to run it");
    return;
  }
  pass("admin signs in", admin.status, 200);

  const authoring = await get("/admin/assessments", admin.cookie);
  pass("authoring page renders", authoring.status, 200);
  pass("has the question editor", authoring.html.includes("Add a question"), true);
  pass("has the pricing editor", authoring.html.includes("Pricing"), true);
  pass("shows Free / Paid state", authoring.html.includes("Free"), true);

  // Create a question through the API the form uses.
  const created = await fetch(`${BASE}/api/admin/questions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({
      assessmentId: paid.id,
      question: {
        type: "multiple_choice",
        prompt: "Which data structure uses FIFO ordering?",
        options: [
          { id: "a", label: "Stack" },
          { id: "b", label: "Queue" },
          { id: "c", label: "Tree" },
        ],
        correctAnswer: "b",
        rubric: null,
        competencyId: null,
        difficulty: 0.4,
        timeLimitSec: 120,
      },
    }),
  });
  const createdBody = await created.json();
  pass("question created", created.status, 201);
  console.log("   question id:", createdBody.questionId);

  const after = await get("/admin/assessments", admin.cookie);
  pass("new question appears in the list", after.html.includes("FIFO"), true);

  // Flip the course to free and confirm the candidate can start it.
  const flip = await fetch(`${BASE}/api/admin/assessments/price`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ assessmentId: paid.id, priceMinor: 0, vatMinor: 0 }),
  });
  pass("price update accepted", flip.status, 200);

  const dash2 = await get("/candidate", cand.cookie);
  pass("course now shows Free", dash2.html.includes(">Free<"), true);

  const start2 = await get(`/candidate/assessment/${inv.id}`, cand.cookie);
  pass("start page no longer asks for payment", !start2.html.includes("Total to pay"), true);

  // Restore the paid price so the fixture is reusable.
  await fetch(`${BASE}/api/admin/assessments/price`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({
      assessmentId: paid.id,
      priceMinor: paid.price_minor,
      vatMinor: paid.vat_minor ?? 0,
    }),
  });

  // Remove the question this run added. The admin API has no dedup — correct for
  // a real author, but it means a test run would otherwise permanently change a
  // seeded course's question count and break suites that assert on it.
  await sql.query("delete from assessment_questions where question_id = $1", [
    createdBody.questionId,
  ]);
  await sql.query("delete from questions where id = $1", [createdBody.questionId]);

  console.log("\npaid price restored and test question removed; all checks complete");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});