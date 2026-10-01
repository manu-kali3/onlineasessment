// Drives the DEPLOYED reset-password endpoint with a real token, to find where
// the flow actually breaks.
const { neon } = require("@neondatabase/serverless");
const { createHash, randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const BASE =
  process.env.BASE || "https://onlineasassessment.vercel.app";
const EMAIL = "candidate@portal.test";
const NEW_PASSWORD = "a brand new long passphrase 77";

const rows = (r) => r.rows ?? r;
const sha256 = (v) => createHash("sha256").update(v).digest("hex");

async function post(path, body) {
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

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function main() {
  const pass = (l, a, e) =>
    console.log(`${a === e ? "PASS" : "FAIL"}  ${l} (got ${JSON.stringify(a)})`);

  console.log(`target: ${BASE}\n`);

  console.log("=== reset page loads with a token ===");
  const plaintext = randomBytes(32).toString("base64url");
  const [user] = rows(await sql.query("select id from users where email = $1", [EMAIL]));
  await sql.query(
    "delete from auth_tokens where user_id = $1 and purpose = 'password_reset'",
    [user.id],
  );
  await sql.query(
    `insert into auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
     values ($1,$2,'password_reset',$3, now() + interval '60 minutes', now())`,
    [randomBytes(8).toString("hex"), user.id, sha256(plaintext)],
  );

  const page = await fetch(`${BASE}/reset-password?token=${plaintext}`);
  const html = await page.text();
  pass("page status", page.status, 200);
  pass("form rendered", html.includes("Choose a new password"), true);
  pass("token missing warning absent", !html.includes("Link missing"), true);

  console.log("\n=== weak password rejected ===");
  const weak = await post("/api/auth/reset-password", {
    token: plaintext,
    password: "Passw0rd!",
  });
  pass("weak rejected", weak.status, 400);
  pass("explains the rule", /12 characters/.test(weak.data?.error ?? ""), true);

  console.log("\n=== valid password accepted ===");
  const ok = await post("/api/auth/reset-password", {
    token: plaintext,
    password: NEW_PASSWORD,
  });
  pass("accepted", ok.status, 200);
  console.log("  message:", ok.data?.message);

  console.log("\n=== new password signs in ===");
  const good = await login(EMAIL, NEW_PASSWORD);
  pass("signs in", good.status, 200);

  const old = await login(EMAIL, "Passw0rd!");
  pass("old password rejected", old.status, 401);

  // restore the demo password so the rest of the suite still works
  const bcrypt = require("bcryptjs");
  await sql.query(
    "update users set password_hash = $1, session_version = session_version + 1 where email = $2",
    [bcrypt.hashSync("Passw0rd!", 12), EMAIL],
  );
  const restored = await login(EMAIL, "Passw0rd!");
  pass("demo password restored", restored.status, 200);

  await sql.query(
    "delete from auth_tokens where user_id = $1 and purpose = 'password_reset'",
    [user.id],
  );
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});