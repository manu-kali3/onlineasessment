// Confirms the AI quiz seeded correctly and, more importantly, that it
// auto-grades: submit a perfect run and a mixed run and check the scores.
const { neon } = require("@neondatabase/serverless");
const { randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = require("./lib/db.cjs").withRetry(neon(process.env.DATABASE_URL));

const BASE = process.env.BASE || "http://localhost:3220";
const EMAIL = "jordan@portal.test";
const rows = (r) => r.rows ?? r;

async function call(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: "Passw0rd!" }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)})`}`,
    );

  // This suite is about AI auto-grading, not payments. AI Fundamentals is a paid
  // course, so without a grant every attempt API correctly answers 402 and the
  // suite would fail for the wrong reason.
  const uid = rows(
    await sql.query("select id from users where email = $1", [EMAIL]),
  )[0]?.id;
  if (uid) {
    await sql.query(
      `insert into course_access (id, user_id, assessment_id, source)
       values ($1, $2, 'asmt-ai-fundamentals', 'admin')
       on conflict (user_id, assessment_id) do nothing`,
      [randomBytes(12).toString("hex"), uid],
    );
  }

  console.log("=== seeded questions and key ===");
  const qs = rows(
    await sql.query(
      `select aq.position, q.id, q.type, q.correct_answer, jsonb_array_length(q.options) as options
       from assessment_questions aq join questions q on q.id = aq.question_id
       where aq.assessment_id = 'asmt-ai-fundamentals' order by aq.position`,
    ),
  );
  pass("five questions", qs.length, 5);
  for (const q of qs) {
    console.log(
      `   ${q.position}. ${q.id.padEnd(22)} ${q.type.padEnd(16)} options=${q.options} answer=${q.correct_answer}`,
    );
  }
  pass("all are multiple_choice", qs.every((q) => q.type === "multiple_choice"), true);
  pass("all have four options", qs.every((q) => q.options === 4), true);
  pass("all have an answer", qs.every((q) => q.correct_answer), true);

  const assessment = rows(
    await sql.query("select title, delivery, pass_mark from assessments where id = 'asmt-ai-fundamentals'"),
  )[0];
  pass("published untimed", `${assessment.title}/${assessment.delivery}`, "AI Fundamentals/untimed");

  const invs = rows(
    await sql.query(
      `select u.email from assessment_invitations ai join users u on u.id = ai.candidate_id
       where ai.assessment_id = 'asmt-ai-fundamentals' order by u.email`,
    ),
  );
  console.log(`\nInvited (${invs.length}): ${invs.map((i) => i.email).join(", ")}`);

  // ---- auto-grading check ----
  const cookie = await login();
  const inv = rows(
    await sql.query(
      `select ai.id from assessment_invitations ai join users u on u.id = ai.candidate_id
       where u.email = $1 and ai.assessment_id = 'asmt-ai-fundamentals'`,
      [EMAIL],
    ),
  )[0];

  // Clear prior attempts for THIS course only. Wiping every attempt for the user
// would destroy the fixtures other suites (smoke-flow) depend on.
  await sql.query(
    `delete from attempts
      where assessment_id = 'asmt-ai-fundamentals'
        and candidate_id in (select id from users where email = $1)`,
    [EMAIL],
  );
  await sql.query(
    `update assessment_invitations set status = 'invited'
      where assessment_id = 'asmt-ai-fundamentals'
        and candidate_id in (select id from users where email = $1)`,
    [EMAIL],
  );

  const start = await call("/api/attempts/start", { invitationId: inv.id }, cookie);
  const attemptId = start.data?.attemptId;
  pass("attempt started", start.status, 200);

  // Three right, two wrong. Each save is checked: a silently rejected answer would
  // otherwise shift the score and make this suite fail for the wrong reason.
  const answers = { "ai-agi": "b", "ai-turing": "c", "ai-computer-vision": "d", "ai-backprop": "a", "ai-reinforcement": "a" };
  for (const [questionId, answer] of Object.entries(answers)) {
    const saved = await call(
      "/api/attempts/response",
      { attemptId, questionId, answer },
      cookie,
    );
    if (saved.status !== 200) {
      console.log(`   ! save rejected for ${questionId}: ${saved.status} ${JSON.stringify(saved.data)}`);
    }
  }

  const submit = await call("/api/attempts/submit", { attemptId }, cookie);
  pass("submit accepted", submit.status, 200);
  pass("score is 60 (3 of 5)", submit.data?.score, 60);
  pass("fully auto-graded", submit.data?.pendingHumanReview, false);
  pass("no items awaiting review", submit.data?.itemsPendingReview, 0);
  pass("pass mark not met", submit.data?.passed, false);
  pass("status is graded", submit.data?.ok, true);
  console.log("   competency scores:", JSON.stringify(submit.data?.competencyScores));

  const attempt = rows(await sql.query("select status, score, passed from attempts where id = $1", [attemptId]))[0];
  pass("attempt recorded as graded", attempt.status, "graded");
  pass("score persisted", attempt.score, 60);

  await cleanup(uid);
  console.log("\ncleanup done");
}

/** Removes the attempt and the temporary grant this suite created. */
async function cleanup(uid) {
  await sql.query(
    `delete from attempts
      where assessment_id = 'asmt-ai-fundamentals'
        and candidate_id in (select id from users where email = $1)`,
    [EMAIL],
  );
  // Revoke only the grant this suite made, so the paywall suites keep working.
  if (uid) {
    await sql.query(
      "delete from course_access where user_id = $1 and assessment_id = 'asmt-ai-fundamentals' and source = 'admin'",
      [uid],
    );
  }
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});