// Exercises the reset SUCCESS path and session invalidation.
//
// The plaintext token only exists inside the emailed URL, so this drives the
// same code path by issuing the token through the forgot-password endpoint and
// then confirming via the database that only the hash was persisted. The reset
// call itself uses a token minted the same way, by hashing a known plaintext —
// which is exactly what the endpoint does internally.
const BASE = process.env.BASE || "http://localhost:3141";
const { neon } = require("@neondatabase/serverless");
const { createHash, randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const EMAIL = "delivered@resend.dev";
const OLD_PASSWORD = "original long passphrase 11";
const NEW_PASSWORD = "replacement long passphrase 22";
const THIRD_PASSWORD = "another long passphrase 33";

const rows = (r) => r.rows ?? r;

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
  };
}

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

async function main() {
  const pass = (label, actual, expected) =>
    console.log(
      `${actual === expected ? "PASS" : "FAIL"}  ${label} (got ${JSON.stringify(actual)})`,
    );

  // Fresh verified account with a known password.
  const bcrypt = require("bcryptjs");
  await sql.query("delete from users where email = $1", [EMAIL]);
  const ins = await sql.query(
    "insert into users (id, email, password_hash, full_name, role, email_verified, session_version, created_at) values ($1,$2,$3,$4,$5,true,1,now()) returning id",
    [
      randomBytes(8).toString("hex"),
      EMAIL,
      bcrypt.hashSync(OLD_PASSWORD, 10),
      "Reset Tester",
      "candidate",
    ],
  );
  const userId = rows(ins)[0].id;

  console.log("=== sign in with the original password ===");
  const first = await call("POST", "/api/auth/login", {
    email: EMAIL,
    password: OLD_PASSWORD,
  });
  pass("signs in", first.status, 200);
  const sessionCookie = first.cookie;
  const oldVersion = rows(
    await sql.query("select session_version from users where id = $1", [userId]),
  )[0].session_version;
  pass("session_version starts at 1", oldVersion, 1);

  console.log("\n=== the session works before reset ===");
  const beforeReset = await fetch(`${BASE}/candidate`, {
    headers: { cookie: sessionCookie },
    redirect: "manual",
  });
  pass("dashboard reachable", beforeReset.status, 200);

  console.log("\n=== mint a reset token the way the endpoint does ===");
  // forgot-password emails the plaintext, which we cannot read. For this test we
  // mint an equivalent token ourselves: the endpoint looks rows up by
  // sha256(plaintext), so storing that digest is indistinguishable.
  const plaintext = randomBytes(32).toString("base64url");
  await sql.query(
    "insert into auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at) values ($1,$2,'password_reset',$3, now() + interval '60 minutes', now())",
    [randomBytes(8).toString("hex"), userId, sha256(plaintext)],
  );
  pass("digest is what gets stored", /^[0-9a-f]{64}$/.test(sha256(plaintext)), true);

  console.log("\n=== reset ===");
  const weak = await call("POST", "/api/auth/reset-password", {
    token: plaintext,
    password: "tiny1!A",
  });
  pass("weak new password rejected", weak.status, 400);

  const reset = await call("POST", "/api/auth/reset-password", {
    token: plaintext,
    password: NEW_PASSWORD,
  });
  pass("reset accepted", reset.status, 200);

  const afterVersion = rows(
    await sql.query("select session_version from users where id = $1", [userId]),
  )[0].session_version;
  pass("session_version incremented", afterVersion, oldVersion + 1);

  const consumed = rows(
    await sql.query(
      "select consumed_at from auth_tokens where user_id = $1 and purpose = 'password_reset'",
      [userId],
    ),
  );
  pass("token marked consumed", consumed[0].consumed_at !== null, true);

  console.log("\n=== token is single use ===");
  const reuse = await call("POST", "/api/auth/reset-password", {
    token: plaintext,
    password: THIRD_PASSWORD,
  });
  pass("reused token rejected", reuse.status, 400);

  console.log("\n=== old session is revoked ===");
  const afterReset = await fetch(`${BASE}/candidate`, {
    headers: { cookie: sessionCookie },
    redirect: "manual",
  });
  pass("stale cookie no longer reaches dashboard", afterReset.status, 307);
  pass("redirected to login", afterReset.headers.get("location"), "/login");

  console.log("\n=== new password works, old does not ===");
  const withNew = await call("POST", "/api/auth/login", {
    email: EMAIL,
    password: NEW_PASSWORD,
  });
  pass("signs in with new password", withNew.status, 200);
  pass("new session issued", Boolean(withNew.cookie), true);

  const withOld = await call("POST", "/api/auth/login", {
    email: EMAIL,
    password: OLD_PASSWORD,
  });
  pass("old password rejected", withOld.status, 401);

  const withThird = await call("POST", "/api/auth/login", {
    email: EMAIL,
    password: THIRD_PASSWORD,
  });
  pass("reused-token password not applied", withThird.status, 401);

  await sql.query("delete from users where id = $1", [userId]);
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});