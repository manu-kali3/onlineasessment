// Verifies the course catalog and the payment-reference flow:
//   - a candidate sees every published course on sign-in, not only invitations
//   - enrolling in a free course creates the invitation and grants access
//   - a paid course routes to checkout instead of enrolling
//   - a submitted reference does NOT grant access until an admin verifies it
//   - verifying grants access, and re-reviewing is refused
//   - a candidate cannot reach the admin review queue
//
// Runs against a throwaway candidate created here and deleted afterwards, so it
// does not depend on whatever invitations the seeds happen to have set up.
//
// Credentials come from the environment so nothing secret is committed.
const BASE = process.env.BASE || "http://localhost:3280";
const CAND = process.env.SMOKE_CANDIDATE_PASSWORD;
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
function truthy(label, value) {
  value ? pass++ : fail++;
  console.log(`${value ? "PASS" : "FAIL"}  ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * This machine's route to Neon drops connections intermittently, which surfaces
 * as a 500 or a thrown fetch. That is environmental, so retry rather than report
 * a false failure — a 4xx is never retried, so real rejections still surface.
 */
async function resilient(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fn();
      if (res.status < 500) return res;
      last = res;
    } catch (e) {
      last = e;
    }
    await sleep(400 * (i + 1));
  }
  if (last instanceof Error) throw last;
  return last;
}

async function q(text, params) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await sql.query(text, params);
      return res.rows ?? res;
    } catch (e) {
      last = e;
      await sleep(400 * (i + 1));
    }
  }
  throw last;
}

/** Next escapes `&` in rendered text, so compare against the escaped form. */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function coursePaid(uid) {
  return (
    await q(
      `select id, title, price_minor, vat_minor from assessments
        where status = 'published' and price_minor > 0
          and not exists (select 1 from course_access ca
                           where ca.assessment_id = assessments.id and ca.user_id = $1)
        limit 1`,
      [uid],
    )
  )[0];
}

async function courseFree(uid) {
  return (
    await q(
      `select id, title from assessments a
        where status = 'published' and price_minor = 0
          and not exists (select 1 from assessment_invitations i
                           where i.assessment_id = a.id and i.candidate_id = $1)
        order by a.created_at limit 1`,
      [uid],
    )
  )[0];
}

/** A throwaway candidate with no invitations, so enrol paths are reachable. */
async function createFixture(email, password) {
  await q("delete from users where email = $1", [email]);
  await q(
    `insert into users (id, email, full_name, password_hash, role, email_verified, session_version)
     values ($1, $2, $3, $4, 'candidate', true, 0)`,
    [crypto.randomUUID(), email, "Smoke Candidate", bcrypt.hashSync(password, 10)],
  );
  return (
    await q("select id from users where email = $1", [email])
  )[0].id;
}

async function main() {
  if (!CAND || !ADMIN) {
    console.log(
      "SKIP  set SMOKE_CANDIDATE_PASSWORD and GRANT_ADMIN_PASSWORD to run this suite",
    );
    return;
  }

  const email = `smoke-enroll-${Date.now()}@portal.test`;
  let uid = null;

  try {
    uid = await createFixture(email, CAND);
    console.log(`fixture candidate: ${email}`);

    const cand = await login(email, CAND);
    check("fixture signs in", cand.status, 200);

    // ---- catalog visible on sign-in ----
    console.log("\n=== catalog on sign-in ===");
    const dash = await get("/candidate", cand.cookie);
    check("dashboard loads", dash.status, 200);
    truthy(
      "dashboard links to the catalog",
      dash.html.includes("/candidate/courses"),
    );

    const cat = await get("/candidate/courses", cand.cookie);
    check("catalog page loads", cat.status, 200);

    const published = await q(
      "select id, title from assessments where status = 'published'",
    );
    truthy(`there are ${published.length} published courses`, published.length > 0);
    const missing = published.filter((p) => !cat.html.includes(escapeHtml(p.title)));
    check("every published course appears", missing.length, 0);
    if (missing.length) console.log("   missing:", missing.map((m) => m.title));

    // A brand-new candidate has no invitations, so everything should offer enrol.
    truthy(
      "new candidate sees no 'Enrolled' badges",
      !cat.html.includes(">Enrolled<"),
    );

    // ---- enrol in a free course ----
    console.log("\n=== enrolling in a free course ===");
    const free = await courseFree(uid);
    if (!free) {
      console.log("SKIP  no published free course to enrol in");
    } else {
      const r = await post("/api/attempts/enroll", { assessmentId: free.id }, cand.cookie);
      check("free enrol succeeds", r.status, 200);
      check("reports enrolled", r.data.enrolled, true);
      check("no checkout needed", r.data.checkoutUrl, null);

      const inv = (
        await q(
          `select id from assessment_invitations
            where candidate_id = $1 and assessment_id = $2`,
          [uid, free.id],
        )
      )[0];
      truthy("invitation was created", Boolean(inv));

      const access = (
        await q(
          "select source from course_access where user_id = $1 and assessment_id = $2",
          [uid, free.id],
        )
      )[0];
      check("access granted with source 'free'", access?.source, "free");

      const again = await post(
        "/api/attempts/enroll",
        { assessmentId: free.id },
        cand.cookie,
      );
      check("re-enrol is idempotent", again.data.alreadyEnrolled, true);
      const n = (
        await q(
          `select count(*)::int as n from assessment_invitations
            where candidate_id = $1 and assessment_id = $2`,
          [uid, free.id],
        )
      )[0].n;
      check("no duplicate invitation", n, 1);

      const pre = await get(`/candidate/assessment/${inv.id}`, cand.cookie);
      check("pre-flight reachable after enrolling", pre.status, 200);

      // And the runner must actually open for a free course.
      const started = await post(
        "/api/attempts/start",
        { invitationId: inv.id },
        cand.cookie,
      );
      check("attempt starts", started.status, 200);
      const runner = await get(
        `/candidate/test/${started.data.attemptId}`,
        cand.cookie,
      );
      check("free course runner opens", runner.status, 200);
    }

    // ---- paid course routes to checkout ----
    console.log("\n=== paid course routing ===");
    const paid = await coursePaid(uid);
    if (!paid) {
      console.log("SKIP  no paid course — set one via npm run db:set-course-price");
    } else {
      const r = await post("/api/attempts/enroll", { assessmentId: paid.id }, cand.cookie);
      check("paid enrol writes no invitation", r.data.enrolled, undefined);
      check("paid enrol requires payment", r.data.requiresPayment, true);
      check("  pointing at checkout", r.data.checkoutUrl, `/paywall?course=${paid.id}`);

      const invCount = (
        await q(
          `select count(*)::int as n from assessment_invitations
            where candidate_id = $1 and assessment_id = $2`,
          [uid, paid.id],
        )
      )[0].n;
      check("still no invitation row", invCount, 0);

      const pw = await get(`/paywall?course=${paid.id}`, cand.cookie);
      check("checkout page loads", pw.status, 200);
      truthy("checkout shows the total", pw.html.includes("Total to pay"));
      truthy("checkout has the M-Pesa field", pw.html.includes("M-Pesa phone number"));
      truthy("checkout has the already-paid form", pw.html.includes("Already paid?"));

      // ---- reference submission grants nothing on its own ----
      console.log("\n=== payment reference review ===");
      const admin = await login("manu161@brevansoftwares.co.ke", ADMIN);
      check("admin signs in", admin.status, 200);

      const code = `QSMOKE${Date.now().toString().slice(-8)}`;
      const sub = await post(
        "/api/payments/reference",
        { assessmentId: paid.id, referenceCode: code, channel: "M-Pesa" },
        cand.cookie,
      );
      check("reference accepted", sub.status, 200);
      check("  lands as pending", sub.data.status, "pending");

      const dup = await post(
        "/api/payments/reference",
        { assessmentId: paid.id, referenceCode: `${code}X` },
        cand.cookie,
      );
      check("duplicate submission blocked", dup.data.alreadySubmitted, true);
      const refCount = (
        await q(
          `select count(*)::int as n from payment_references
            where user_id = $1 and assessment_id = $2`,
          [uid, paid.id],
        )
      )[0].n;
      check("only one reference row", refCount, 1);

      // The runner must still refuse: a pasted code is not proof of payment.
      const st = await (
        await resilient(() =>
          fetch(`${BASE}/api/payments/status?course=${paid.id}`, {
            headers: { cookie: cand.cookie },
          }),
        )
      ).json();
      check("reference alone does NOT grant access", st.paid, false);

      const queue = await get("/admin/payments", admin.cookie);
      check("admin queue loads", queue.status, 200);
      truthy("queue shows the submitted code", queue.html.includes(code));

      const listed = await get("/api/admin/payments/references", admin.cookie);
      const refs = listed.status === 200 ? JSON.parse(listed.html).references : [];
      const mine = refs.find((x) => x.referenceCode === code);
      truthy("reference appears in the API queue", Boolean(mine));
      truthy("  with candidate identity", Boolean(mine?.candidateEmail));
      truthy("  with the course title", Boolean(mine?.assessmentTitle));
      truthy("  marked pending", mine?.status === "pending");

      const verified = await post(
        `/api/admin/payments/references/${mine.id}`,
        { action: "verify" },
        admin.cookie,
      );
      check("verify succeeds", verified.status, 200);
      check("  reports access granted", verified.data.accessGranted, true);

      const after = await (
        await resilient(() =>
          fetch(`${BASE}/api/payments/status?course=${paid.id}`, {
            headers: { cookie: cand.cookie },
          }),
        )
      ).json();
      check("access now granted", after.paid, true);

      const twice = await post(
        `/api/admin/payments/references/${mine.id}`,
        { action: "verify" },
        admin.cookie,
      );
      check("re-review refused", twice.status, 409);

      // Now that access is granted, checkout must refuse to take more money.
      const again = await post(
        "/api/attempts/enroll",
        { assessmentId: paid.id },
        cand.cookie,
      );
      check("already-unlocked enrol needs no payment", again.data.checkoutUrl, null);
    }

    // ---- a candidate cannot reach the admin queue ----
    console.log("\n=== authorization ===");
    const candQueue = await get("/api/admin/payments/references", cand.cookie);
    check("candidate blocked from reference queue", candQueue.status, 403);
    const candAdmin = await get("/admin/payments", cand.cookie);
    truthy("candidate redirected away from admin page", candAdmin.status !== 200);
    const candRef = await post(
      "/api/admin/payments/references/anything",
      { action: "verify" },
      cand.cookie,
    );
    check("candidate cannot verify a reference", candRef.status, 403);
  } finally {
    // Deleting the user cascades invitations, access, references and attempts.
    if (uid) {
      await q("delete from users where id = $1", [uid]).catch(() => {});
      console.log("\nfixture candidate removed");
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.log("FATAL:", e.stack ?? e.message);
  process.exit(1);
});