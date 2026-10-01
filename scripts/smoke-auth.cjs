// Full self-service auth journey against a live server.
//
// Emails go to Resend's test address, which requires the `inbound` /
// `delivered@resend.dev` form, so the plaintext token cannot be read back from
// an inbox. Instead we assert on what the database stores and drive the token
// paths through the API.
const BASE = process.env.BASE || "http://localhost:3140";
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

// Resend only accepts its own test address until a sending domain is verified.
const TEST_INBOX = "delivered@resend.dev";
const OLD_PASSWORD = "correct horse battery 42";
const NEW_PASSWORD = "a different long passphrase 99";

function rows(res) {
  return res.rows ?? res;
}

async function call(method, path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return {
    status: res.status,
    data,
    cookie: (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; "),
    location: res.headers.get("location"),
  };
}

async function main() {
  const email = TEST_INBOX;
  const pass = (label, actual, expected) =>
    console.log(
      `${actual === expected ? "PASS" : "FAIL"}  ${label} (got ${actual})`,
    );

  await sql.query("delete from users where email = $1", [email]);

  console.log("=== password policy ===");
  const weak = await call("POST", "/api/auth/register", {
    fullName: "QA Tester",
    email,
    password: "short1!A",
  });
  pass("weak password rejected", weak.status, 400);

  console.log("\n=== registration ===");
  const reg = await call("POST", "/api/auth/register", {
    fullName: "QA Tester",
    email,
    password: OLD_PASSWORD,
  });
  pass("register accepted", reg.status, 200);
  pass("requires verification", reg.data?.requiresVerification, true);
  pass("no dev link (email actually sent)", reg.data?.devVerifyUrl, undefined);

  const dup = await call("POST", "/api/auth/register", {
    fullName: "QA Tester",
    email,
    password: OLD_PASSWORD,
  });
  pass("duplicate returns same status", dup.status, reg.status);
  pass("duplicate returns identical message", dup.data?.message, reg.data?.message);

  const role = await sql.query("select role, email_verified from users where email = $1", [email]);
  pass("role forced to candidate", rows(role)[0].role, "candidate");
  pass("starts unverified", rows(role)[0].email_verified, false);

  console.log("\n=== verification gate ===");
  const early = await call("POST", "/api/auth/login", {
    email,
    password: OLD_PASSWORD,
  });
  pass("login blocked before verifying", early.status, 403);
  pass("blocked with needsVerification", early.data?.needsVerification, true);

  const badVerify = await call("GET", "/api/auth/verify-email?token=definitelynotreal");
  pass("bogus verify redirects to invalid", badVerify.location?.includes("status=invalid"), true);

  const stored = await sql.query(
    "select token_hash, expires_at, consumed_at from auth_tokens where purpose = 'email_verification'",
  );
  pass("token stored hashed", /^[0-9a-f]{64}$/.test(rows(stored)[0].token_hash), true);
  pass("token unconsumed", rows(stored)[0].consumed_at, null);

  console.log("\n=== reset while unverified ===");
  const forgot = await call("POST", "/api/auth/forgot-password", { email });
  pass("forgot-password accepted", forgot.status, 200);

  const unknown = await call("POST", "/api/auth/forgot-password", {
    email: "nobody-here@example.invalid",
  });
  pass("unknown address same status", unknown.status, forgot.status);
  pass("unknown address same message", unknown.data?.message, forgot.data?.message);

  // Reset requires the plaintext token, which only exists in the email, so
  // verify that a guessed token cannot work.
  const guess = await call("POST", "/api/auth/reset-password", {
    token: "a".repeat(43),
    password: NEW_PASSWORD,
  });
  pass("guessed reset token rejected", guess.status, 400);
  pass(
    "rejection message is generic",
    guess.data?.error?.includes("invalid or has expired"),
    true,
  );

  const stillOld = await call("POST", "/api/auth/login", {
    email,
    password: OLD_PASSWORD,
  });
  pass("old password still not usable (unverified)", stillOld.status, 403);

  console.log("\n=== staff accounts unaffected ===");
  const staff = await call("POST", "/api/auth/login", {
    email: "recruiter@portal.test",
    password: "Passw0rd!",
  });
  pass("seeded recruiter can sign in", staff.status, 200);
  pass("session cookie issued", Boolean(staff.cookie), true);

  // ---- cleanup ----
  await sql.query("delete from users where email = $1", [email]);
  await sql.query("delete from auth_tokens");
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("FATAL:", e.message, e.stack);
  process.exit(1);
});