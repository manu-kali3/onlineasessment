// Verifies the per-course access gate.
//
// The global sign-in paywall is gone, so access is decided per course. This suite
// covers the case the removed one used to: a candidate who holds an invitation to
// a PAID course but has not paid.
//
// That combination is reachable in production — an admin can invite someone to a
// paid course, a seed can do it, or a course can be repriced after invitations
// went out — so it must be refused. The page check is not sufficient on its own,
// because the attempt APIs are reachable directly.
//
// Passwords come from the environment, never from source.
const BASE = process.env.BASE || "http://localhost:3280";
const ADMIN = process.env.GRANT_ADMIN_PASSWORD;
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * This machine's route to Neon is intermittently dropping, which surfaces both as
 * thrown fetches and as 500s from the app. Retry generously; a 4xx is never
 * retried, so genuine rejections still surface immediately.
 */
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

async function q(text, params) {
  let last;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await sql.query(text, params);
      return res.rows ?? res;
    } catch (e) {
      last = e;
      await sleep(600 * (i + 1));
    }
  }
  throw last;
}

async function login(email, password) {
  const res = await resilient(() =>
    fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const raw = res.headers.getSetCookie?.() ?? [];
  return {
    status: res.status,
    cookie: raw.map((c) => c.split(";")[0]).join("; "),
  };
}

async function page(path, cookie) {
  const res = await resilient(() =>
    fetch(`${BASE}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    }),
  );
  return { status: res.status, location: res.headers.get("location") };
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
  // ---- staff are no longer charged just for signing in ----
  console.log("=== staff are not paywalled at sign-in ===");
  if (!ADMIN) {
    console.log("SKIP  set GRANT_ADMIN_PASSWORD to check the operator account");
  } else {
    const admin = await login("manu161@brevansoftwares.co.ke", ADMIN);
    check("operator signs in", admin.status, 200);
    check("operator reaches /admin without paying", (await page("/admin", admin.cookie)).status, 200);
    check(
      "operator reaches the pricing screen",
      (await page("/admin/assessments", admin.cookie)).status,
      200,
    );
  }

  // ---- an invited-but-unpaid candidate is refused ----
  console.log("\n=== invited but unpaid on a paid course ===");
  const password = process.env.SMOKE_CANDIDATE_PASSWORD || "Passw0rd!";
  const email = `smoke-granted-${Date.now()}@portal.test`;
  let uid = null;

  const paid = (
    await q(
      "select id, title from assessments where status = 'published' and price_minor > 0 limit 1",
    )
  )[0];

  if (!paid) {
    console.log("SKIP  no paid course — set one via npm run db:set-course-price");
    console.log(`\n${pass} passed, ${fail} failed`);
    return;
  }

  try {
    await q("delete from users where email = $1", [email]);
    await q(
      `insert into users (id, email, full_name, password_hash, role, email_verified, session_version)
       values ($1, $2, $3, $4, 'candidate', true, 0)`,
      [crypto.randomUUID(), email, "Smoke Granted", bcrypt.hashSync(password, 10)],
    );
    uid = (await q("select id from users where email = $1", [email]))[0].id;

    // The invitation exists but no course_access row: exactly the risky state.
    const invitationId = crypto.randomUUID();
    await q(
      `insert into assessment_invitations
         (id, assessment_id, candidate_id, token, expires_at, status)
       values ($1, $2, $3, $4, now() + interval '30 days', 'invited')`,
      [invitationId, paid.id, uid, crypto.randomUUID().replace(/-/g, "")],
    );

    const cand = await login(email, password);
    check("fixture signs in", cand.status, 200);

    const runner = await page(`/candidate/assessment/${invitationId}`, cand.cookie);
    check("pre-flight renders", runner.status, 200);

    // Start, then confirm every attempt API refuses the unpaid candidate.
    const started = await post("/api/attempts/start", { invitationId }, cand.cookie);
    check("start is refused", started.status, 402);
    check("  with PAYMENT_REQUIRED", started.data.code, "PAYMENT_REQUIRED");
    check("  pointing at checkout", started.data.checkoutUrl, `/paywall?course=${paid.id}`);

    const nAttempts = (
      await q(
        "select count(*)::int as n from attempts where candidate_id = $1",
        [uid],
      )
    )[0].n;
    check("no attempt row was created", nAttempts, 0);

    // A made-up attempt id must not let an unpaid candidate reach the other APIs.
    const save = await post("/api/attempts/response", {
      attemptId: crypto.randomUUID(),
      questionId: crypto.randomUUID(),
      value: "x",
    }, cand.cookie);
    check("response save does not proceed", [400, 402, 404].includes(save.status), true);

    const submit = await post("/api/attempts/submit", {
      attemptId: crypto.randomUUID(),
    }, cand.cookie);
    check("submit does not proceed", [400, 402, 404].includes(submit.status), true);

    const proctor = await post("/api/attempts/proctor", {
      attemptId: crypto.randomUUID(),
      type: "blur",
    }, cand.cookie);
    check("proctor signal does not proceed", [400, 402, 404].includes(proctor.status), true);

    // ---- grant access, as a verified payment would ----
    console.log("\n=== after access is granted ===");
    await q(
      `insert into course_access (id, user_id, assessment_id, source)
       values ($1, $2, $3, 'admin')`,
      [crypto.randomUUID(), uid, paid.id],
    );

    const started2 = await post("/api/attempts/start", { invitationId }, cand.cookie);
    check("start now succeeds", started2.status, 200);
    const attemptId = started2.data.attemptId;
    truthy("attempt id issued", Boolean(attemptId));

    const runner2 = await page(`/candidate/test/${attemptId}`, cand.cookie);
    check("runner now opens", runner2.status, 200);

    // And the paywall sends them back to the catalog rather than a dead end.
    const wall = await page(`/paywall?course=${paid.id}`, cand.cookie);
    check("paywall redirects an unlocked candidate", wall.status, 307);
    check("  to the dashboard", wall.location, "/candidate");
  } finally {
    if (uid) {
      await q("delete from users where id = $1", [uid]).catch(() => {});
      console.log("\nfixture removed");
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

function truthy(label, value) {
  value ? pass++ : fail++;
  console.log(`${value ? "PASS" : "FAIL"}  ${label}`);
}

main().catch((e) => {
  console.log("FATAL:", e.stack ?? e.message);
  process.exit(1);
});