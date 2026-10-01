// Verifies the resend-verification endpoint: the cooldown actually suppresses a
// second email, tokens are rotated, and responses do not reveal whether an
// address is registered.
const BASE = process.env.BASE || "http://localhost:3160";
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function main() {
  const pass = (label, actual, expected) =>
    console.log(
      `${actual === expected ? "PASS" : "FAIL"}  ${label} (got ${JSON.stringify(actual)})`,
    );

  const email = "delivered@resend.dev";
  await sql.query("delete from users where email = $1", [email]);

  console.log("=== register an unverified account ===");
  const reg = await call("/api/auth/register", {
    fullName: "Resend Tester",
    email,
    password: "a sufficiently long passphrase 5",
  });
  pass("registered", reg.status, 200);

  const userRows = rows(await sql.query("select id from users where email = $1", [email]));
  const userId = userRows[0].id;

  const hashAfterRegister = rows(
    await sql.query(
      "select token_hash from auth_tokens where user_id = $1 and purpose = 'email_verification' order by created_at desc limit 1",
      [userId],
    ),
  )[0].token_hash;

  console.log("\n=== cooldown also covers a token just issued ===");
  // Registration issued a token moments ago, so an immediate resend must be a
  // silent no-op rather than a second email.
  const immediate = await call("/api/auth/resend-verification", { email });
  pass("immediate resend 200", immediate.status, 200);
  const stillSame = rows(
    await sql.query(
      `select token_hash from auth_tokens
       where user_id = $1 and purpose = 'email_verification' and consumed_at is null`,
      [userId],
    ),
  );
  pass("token not rotated within cooldown", stillSame[0].token_hash, hashAfterRegister);

  console.log("\n=== resend rotates the token once the cooldown lapses ===");
  // Backdate the token past the cooldown so the rotation path is reachable.
  await sql.query(
    "update auth_tokens set created_at = now() - interval '5 minutes' where user_id = $1",
    [userId],
  );

  const r1 = await call("/api/auth/resend-verification", { email });
  pass("resend accepted", r1.status, 200);

  const live = rows(
    await sql.query(
      `select token_hash, consumed_at from auth_tokens
       where user_id = $1 and purpose = 'email_verification' order by created_at desc`,
      [userId],
    ),
  );
  const unconsumed = live.filter((t) => t.consumed_at === null);
  pass("exactly one live token", unconsumed.length, 1);
  pass("token differs from the original", unconsumed[0].token_hash !== hashAfterRegister, true);
  pass("previous token consumed", live.find((t) => t.token_hash === hashAfterRegister).consumed_at !== null, true);

  console.log("\n=== cooldown suppresses a second email ===");
  const r2 = await call("/api/auth/resend-verification", { email });
  pass("second resend still 200", r2.status, 200);
  pass("same message (cooldown is silent)", r2.data?.message, immediate.data?.message);

  const after = rows(
    await sql.query(
      `select token_hash from auth_tokens
       where user_id = $1 and purpose = 'email_verification' and consumed_at is null`,
      [userId],
    ),
  );
  pass("still one live token", after.length, 1);
  pass(
    "token NOT rotated during cooldown",
    after[0].token_hash,
    unconsumed[0].token_hash,
  );

  console.log("\n=== no account enumeration ===");
  const unknown = await call("/api/auth/resend-verification", {
    email: "definitely-not-registered@example.invalid",
  });
  pass("unknown address 200", unknown.status, 200);
  pass("same message", unknown.data?.message, immediate.data?.message);

  console.log("\n=== verified accounts are not re-sent ===");
  await sql.query("update users set email_verified = true where email = $1", [email]);
  await sql.query("delete from auth_tokens where user_id = $1", [userId]);
  const verified = await call("/api/auth/resend-verification", { email });
  pass("verified account 200", verified.status, 200);
  pass("same message", verified.data?.message, immediate.data?.message);
  const none = rows(
    await sql.query("select id from auth_tokens where user_id = $1", [userId]),
  );
  pass("no token issued for a verified account", none.length, 0);

  console.log("\n=== malformed input ===");
  const bad = await call("/api/auth/resend-verification", { email: "not-an-email" });
  pass("invalid email rejected", bad.status, 400);

  await sql.query("delete from users where email = $1", [email]);
  await sql.query("delete from auth_tokens");
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});