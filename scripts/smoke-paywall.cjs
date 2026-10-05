// Verifies the paywall is enforced server-side, not merely shown as an overlay.
//
// The critical check is that an unpaid candidate's protected content is absent
// from the HTML entirely. If the gate were client-side — an overlay, a hidden
// div, CSS — the question text would still ship in the response and be readable
// with view-source or JavaScript disabled.
//
// This is now per course rather than site-wide: a paid course refuses an unpaid
// candidate, a free course renders normally.
const BASE = process.env.BASE || "http://localhost:3280";
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`,
  );
}
function truthy(label, value) {
  value ? pass++ : fail++;
  console.log(`${value ? "PASS" : "FAIL"}  ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function q(text, params) {
  let last;
  for (let i = 0; i < 6; i++) {
    try {
      // The Neon HTTP driver resolves to a plain array, not an object with
      // `.rows`. Falling through to `[]` here would silently match nothing.
      const res = await sql.query(text, params);
      return res.rows ?? res;
    } catch (e) {
      last = e;
      await sleep(600 * (i + 1));
    }
  }
  throw last;
}

async function resilient(fn, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fn();
      if (res.status < 500) return res;
      last = res;
    } catch (e) {
      last = e;
    }
    await sleep(600 * (i + 1));
  }
  if (last instanceof Error) throw last;
  return last;
}

async function login(email, password) {
  const res = await resilient(() =>
    fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  return {
    status: res.status,
    cookie: (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "),
  };
}

async function get(path, cookie) {
  const res = await resilient(() =>
    fetch(`${BASE}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    }),
  );
  return {
    status: res.status,
    location: res.headers.get("location"),
    html: await res.text(),
  };
}

async function post(path, body, cookie) {
  const res = await resilient(() =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body ?? {}),
    }),
  );
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
  const password = process.env.SMOKE_CANDIDATE_PASSWORD || "Passw0rd!";
  const email = `smoke-paywall-${Date.now()}@portal.test`;
  let uid = null;

  const paid = (
    await q(
      "select id, title from assessments where status = 'published' and price_minor > 0 limit 1",
    )
  )[0];
  const free = (
    await q(
      "select id, title from assessments where status = 'published' and price_minor = 0 limit 1",
    )
  )[0];

  if (!paid || !free) {
    console.log("SKIP  needs one published paid course and one free course");
    return;
  }

  try {
    await q("delete from users where email = $1", [email]);
    await q(
      `insert into users (id, email, full_name, password_hash, role, email_verified, session_version)
       values ($1, $2, $3, $4, 'candidate', true, 0)`,
      [crypto.randomUUID(), email, "Smoke Paywall", bcrypt.hashSync(password, 10)],
    );
    uid = (await q("select id from users where email = $1", [email]))[0].id;

    const cand = await login(email, password);
    check("candidate signs in", cand.status, 200);

    // ---- a paid course's content must not reach an unpaid candidate ----
    console.log("\n=== paid course content is not leaked ===");
    const prompts = (
      await q(
        `select q.prompt from questions q
           join assessment_questions aq on aq.question_id = q.id
          where aq.assessment_id = $1`,
        [paid.id],
      )
    ).map((r) => r.prompt);
    truthy(`paid course has ${prompts.length} questions to leak`, prompts.length > 0);

    // Enrol via invitation so a pre-flight page exists, then try to open it.
    const invitationId = crypto.randomUUID();
    await q(
      `insert into assessment_invitations
         (id, assessment_id, candidate_id, token, expires_at, status)
       values ($1, $2, $3, $4, now() + interval '30 days', 'invited')`,
      [invitationId, paid.id, uid, crypto.randomUUID().replace(/-/g, "")],
    );

    const started = await post("/api/attempts/start", { invitationId }, cand.cookie);
    check("cannot start a paid course without paying", started.status, 402);

    // Ask for a plausible attempt id: the response must not contain questions.
    const fakeId = crypto.randomUUID();
    const runnerPage = await get(`/candidate/test/${fakeId}`, cand.cookie);
    for (const prompt of prompts) {
      check(
        `  HTML omits a question prompt: "${prompt.slice(0, 32)}…"`,
        runnerPage.html.includes(prompt),
        false,
      );
    }

    const wall = await get(`/paywall?course=${paid.id}`, cand.cookie);
    check("paywall renders for the paid course", wall.status, 200);
    truthy("paywall states the price", wall.html.includes("Total to pay"));
    truthy("paywall offers a reference-code path", wall.html.includes("Already paid?"));
    check("paywall leaks no question text", prompts.some((p) => wall.html.includes(p)), false);

    // ---- a free course is unaffected ----
    console.log("\n=== a free course still works ===");
    const freeInvitation = crypto.randomUUID();
    await q(
      `insert into assessment_invitations
         (id, assessment_id, candidate_id, token, expires_at, status)
       values ($1, $2, $3, $4, now() + interval '30 days', 'invited')`,
      [freeInvitation, free.id, uid, crypto.randomUUID().replace(/-/g, "")],
    );

    const freeStart = await post(
      "/api/attempts/start",
      { invitationId: freeInvitation },
      cand.cookie,
    );
    check("free course starts without payment", freeStart.status, 200);

    const freeRunner = await get(
      `/candidate/test/${freeStart.data.attemptId}`,
      cand.cookie,
    );
    check("free course runner renders", freeRunner.status, 200);

    const freePrompts = (
      await q(
        `select q.prompt from questions q
           join assessment_questions aq on aq.question_id = q.id
          where aq.assessment_id = $1`,
        [free.id],
      )
    ).map((r) => r.prompt);
    const leaked = freePrompts.filter((p) => freeRunner.html.includes(p));
    check(
      `free course HTML contains its ${freePrompts.length} questions`,
      leaked.length,
      freePrompts.length,
    );

    // ---- no global gate remains ----
    console.log("\n=== no site-wide gate remains ===");
    const dash = await get("/candidate", cand.cookie);
    check("dashboard reachable without paying", dash.status, 200);
    const cat = await get("/candidate/courses", cand.cookie);
    check("catalog reachable without paying", cat.status, 200);
    const bareWall = await get("/paywall", cand.cookie);
    check("bare /paywall redirects away", bareWall.status, 307);
    check("  to the dashboard", bareWall.location, "/candidate");
  } finally {
    if (uid) {
      await q("delete from users where id = $1", [uid]).catch(() => {});
      console.log("\nfixture removed");
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.log("FATAL:", e.stack ?? e.message);
  process.exit(1);
});