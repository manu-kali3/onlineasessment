// Reproduces the verification link failure against the DEPLOYED site: mints a
// real token, follows the verify URL, and reports every hop.
const { neon } = require("@neondatabase/serverless");
const { createHash, randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const BASE = process.env.BASE || "https://onlineasessment.vercel.app";
const rows = (r) => r.rows ?? r;
const sha256 = (v) => createHash("sha256").update(v).digest("hex");

async function main() {
  const email = `verifyprobe${Date.now()}@gmail.com`;

  await sql.query("delete from users where email = $1", [email]);
  await sql.query(
    `insert into users (id, email, password_hash, full_name, role, email_verified, session_version, created_at)
     values ($1,$2,$3,$4,'candidate',false,1,now())`,
    [randomBytes(8).toString("hex"), email, "x", "Verify Probe"],
  );
  const [user] = rows(await sql.query("select id from users where email = $1", [email]));

  const plaintext = randomBytes(32).toString("base64url");
  await sql.query(
    `insert into auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
     values ($1,$2,'email_verification',$3, now() + interval '60 minutes', now())`,
    [randomBytes(8).toString("hex"), user.id, sha256(plaintext)],
  );
  console.log("token minted for", email);

  const url = `${BASE}/verify-email?token=${plaintext}`;
  console.log("\n=== GET the link, no redirect following ===");
  const r = await fetch(url, { redirect: "manual" });
  console.log("status       :", r.status);
  console.log("location     :", r.headers.get("location"));
  const body = await r.text();
  console.log("body         :", JSON.stringify(body.slice(0, 200)));

  console.log("\n=== follow the redirect ===");
  const followed = await fetch(url, { redirect: "follow" });
  console.log("final status :", followed.status);
  console.log("final url    :", followed.url);
  const html = await followed.text();
  const shows = (s) => console.log(`  shows "${s}":`, html.includes(s));
  shows("Email confirmed");
  shows("Link invalid or expired");
  shows("Check your email");
  shows("pending");

  console.log("\n=== database state ===");
  const [after] = rows(
    await sql.query("select email_verified from users where id = $1", [user.id]),
  );
  console.log("email_verified:", after.email_verified);
  const [tok] = rows(
    await sql.query(
      "select consumed_at from auth_tokens where user_id = $1 and purpose = 'email_verification'",
      [user.id],
    ),
  );
  console.log("token consumed:", tok?.consumed_at !== null && tok?.consumed_at !== undefined);

  console.log("\n=== login after verifying ===");
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "a long passphrase here 12" }),
  });
  console.log("login status:", login.status, JSON.stringify(await login.json()));

  await sql.query("delete from users where id = $1", [user.id]);
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});