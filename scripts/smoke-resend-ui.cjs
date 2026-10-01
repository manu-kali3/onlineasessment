// Confirms the login response carries what the resend button needs.
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const BASE = process.env.BASE || "http://localhost:3160";
const EMAIL = "btntest@resend.dev";
const PASSWORD = "a long passphrase here 9";

const rows = (r) => r.rows ?? r;

async function main() {
  await sql.query("delete from users where email = $1", [EMAIL]);

  await sql.query(
    `insert into users
       (id, email, password_hash, full_name, role, email_verified, session_version, created_at)
     values ($1,$2,$3,$4,'candidate',false,1,now())`,
    [
      "btn" + Date.now(),
      EMAIL,
      bcrypt.hashSync(PASSWORD, 10),
      "Button Test",
    ],
  );

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();

  console.log("login status      :", res.status);
  console.log("needsVerification :", body.needsVerification);
  console.log("email echoed      :", body.email);
  console.log(
    "UI can offer resend:",
    body.needsVerification === true && typeof body.email === "string",
  );

  const rs = await fetch(`${BASE}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: body.email }),
  });
  console.log("resend status     :", rs.status);

  await sql.query("delete from users where email = $1", [EMAIL]);
  await sql.query("delete from auth_tokens");
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});