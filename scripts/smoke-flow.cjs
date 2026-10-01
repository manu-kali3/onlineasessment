// Full candidate journey: start an attempt, autosave answers, submit, and check
// the resulting score, percentile, and competency breakdown.
const BASE = process.env.BASE || "http://localhost:3120";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function post(path, cookie, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = "(non-json)";
  }
  return { status: res.status, data };
}

async function main() {
  const cookie = await login("jordan@portal.test", "Passw0rd!");
  console.log("logged in as jordan (seeded in-progress attempt)");

  const HW = { camera: true, microphone: true, downloadMbps: 42.5, passed: true };

  // inv-2 already has att-2 in progress; start must RESUME, not create a new one.
  const start1 = await post("/api/attempts/start", cookie, {
    invitationId: "inv-2",
    hardwareCheck: HW,
  });
  console.log(`start #1: ${start1.status} ${JSON.stringify(start1.data)}`);

  const start2 = await post("/api/attempts/start", cookie, {
    invitationId: "inv-2",
    hardwareCheck: HW,
  });
  console.log(`start #2 (resume): ${start2.status} ${JSON.stringify(start2.data)}`);

  const sameAttempt =
    start1.data?.attemptId === start2.data?.attemptId;
  console.log(`  resume reuses same attempt: ${sameAttempt}`);

  const attemptId = start1.data?.attemptId;

  // Answer every question. Correct answers for asmt-core-b:
  // q-mc-1 -> "b", q-ms-1 -> ["a","c"], q-tf-1 -> false, q-text-1 -> free text.
  const answers = [
    { questionId: "q-mc-1", answer: "b", durationMs: 4200 },
    { questionId: "q-ms-1", answer: ["a", "c"], durationMs: 9100 },
    { questionId: "q-tf-1", answer: false, durationMs: 3000 },
    { questionId: "q-text-1", answer: "I raised it directly with my manager.", durationMs: 15000 },
  ];

  for (const a of answers) {
    const r = await post("/api/attempts/response", cookie, { attemptId, ...a });
    console.log(`save ${a.questionId}: ${r.status}`);
  }

  // Re-saving accumulates time-on-task rather than overwriting.
  const again = await post("/api/attempts/response", cookie, {
    attemptId,
    questionId: "q-mc-1",
    answer: "b",
    durationMs: 1000,
  });
  console.log(`re-save q-mc-1: ${again.status} (should accumulate, not error)`);

  // Security: a question outside this assessment must be rejected.
  const bogus = await post("/api/attempts/response", cookie, {
    attemptId,
    questionId: "q-sji-1",
    answer: "anything",
    durationMs: 100,
  });
  console.log(
    `save q-sji-1 (belongs to a DIFFERENT assessment): ${bogus.status} ${JSON.stringify(bogus.data)}`,
  );

  const submit = await post("/api/attempts/submit", cookie, { attemptId });
  console.log(`\nsubmit: ${submit.status}`);
  console.log(JSON.stringify(submit.data, null, 2));

  const dup = await post("/api/attempts/submit", cookie, { attemptId });
  console.log(`\nresubmit (should be 409): ${dup.status} ${JSON.stringify(dup.data)}`);

  // Proctor signal after submission must be rejected.
  const late = await post("/api/attempts/proctor", cookie, {
    attemptId,
    type: "tab_switch",
    severity: "warning",
  });
  console.log(`proctor signal after submit: ${late.status} ${JSON.stringify(late.data)}`);
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});