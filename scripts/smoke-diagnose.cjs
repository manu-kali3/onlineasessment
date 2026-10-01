// Covers the diagnosing resend endpoint and the duplicate-registration reply.
//
// These endpoints disclose whether an address is registered. That is a
// deliberate product decision, so these tests assert the disclosure is accurate
// and that the rate limits hold, rather than that it is hidden.
const BASE = process.env.BASE || "http://localhost:3170";
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function call(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, retryAfter: res.headers.get("retry-after") };
}

async function main() {
  const pass = (label, actual, expected) =>
    console.log(
      `${actual === expected ? "PASS" : "FAIL"}  ${label} (got ${JSON.stringify(actual)})`,
    );

  const email = "delivered@resend.dev";
  await sql.query("delete from users where email = $1", [email]);

  console.log("=== unregistered address is diagnosed ===");
  const missing = await call("/api/auth/resend-verification", {
    email: "nobody-registered@example.invalid",
  });
  pass("status not_registered", missing.data?.status, "not_registered");
  pass("points at creating an account", /create an account/i.test(missing.data?.message ?? ""), true);

  console.log("\n=== registering reports success ===");
  const reg = await call("/api/auth/register", {
    fullName: "Diagnose Tester",
    email,
    password: "a sufficiently long passphrase 8",
  });
  pass("status registered", reg.data?.status, "registered");

  const userId = rows(
    await sql.query("select id from users where email = $1", [email]),
  )[0].id;

  // Scope to this account: other test users may hold their own tokens.
  const liveFor = async () =>
    rows(
      await sql.query(
        `select token_hash from auth_tokens
         where user_id = $1 and purpose = 'email_verification' and consumed_at is null`,
        [userId],
      ),
    );

  console.log("\n=== unverified address is diagnosed and mailed ===");
  // Clear the mail cooldown left by registration by backdating any live token.
  await sql.query(
    "update auth_tokens set created_at = now() - interval '5 minutes' where user_id = $1",
    [userId],
  );
  const send = await call("/api/auth/resend-verification", { email });
  pass("status sent", send.data?.status, "sent");
  pass("mentions expiry", /60 minutes/i.test(send.data?.message ?? ""), true);

  const live = await liveFor();
  pass("exactly one live token", live.length, 1);

  console.log("\n=== mail cooldown ===");
  const again = await call("/api/auth/resend-verification", { email });
  pass("second call rate limited", again.data?.status, "rate_limited");
  const stillOne = await liveFor();
  pass("no second email issued", stillOne[0].token_hash, live[0].token_hash);

  console.log("\n=== duplicate registration is diagnosed ===");
  const dup = await call("/api/auth/register", {
    fullName: "Diagnose Tester",
    email,
    password: "a sufficiently long passphrase 8",
  });
  pass("status awaiting_verification", dup.data?.status, "awaiting_verification");
  pass("tells them to use resend", /Resend verification link/i.test(dup.data?.message ?? ""), true);

  console.log("\n=== verified address is diagnosed ===");
  await sql.query("update users set email_verified = true where email = $1", [email]);
  const verified = await call("/api/auth/resend-verification", { email });
  pass("status already_verified", verified.data?.status, "already_verified");
  pass("suggests signing in", /Sign in/i.test(verified.data?.message ?? ""), true);

  const confirmed = await call("/api/auth/register", {
    fullName: "Diagnose Tester",
    email,
    password: "a sufficiently long passphrase 8",
  });
  pass("register says already_registered", confirmed.data?.status, "already_registered");

  console.log("\n=== per-IP limit returns 429 ===");
  // A distinct IP so the shared budget does not affect other assertions.
  const codes = [];
  for (let i = 0; i < 26; i++) {
    const r = await call(
      "/api/auth/resend-verification",
      { email: `probe${i}@example.invalid` },
      { "x-forwarded-for": "203.0.113.7" },
    );
    codes.push(r.status);
  }
  pass("some requests rejected", codes.includes(429), true);
  pass("later ones are the rejected ones", codes[25], 429);

  console.log("\n=== malformed input ===");
  const bad = await call("/api/auth/resend-verification", { email: "nope" });
  pass("invalid email 400", bad.status, 400);

  await sql.query("delete from users where email = $1", [email]);
  await sql.query("delete from auth_tokens");
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});