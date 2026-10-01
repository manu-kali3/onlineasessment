// Creates a real administrator account with a password you supply.
//
// Unlike the seeded demo users, this takes the password from the environment or
// an argument rather than hard-coding it, so no known credential ends up in the
// repository or in this script.
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
const { randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

function checkPassword(pw) {
  if ([...pw].length < 12) return "must be at least 12 characters";
  if (Buffer.byteLength(pw, "utf8") > 72) return "must be under 72 bytes";
  return null;
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Portal Administrator").trim();

  if (!email || !email.includes("@")) {
    console.log("Set ADMIN_EMAIL and ADMIN_PASSWORD, for example:");
    console.log("");
    console.log(
      "  $env:ADMIN_EMAIL='you@yourdomain.com'; $env:ADMIN_PASSWORD='<12+ chars>'; npm run db:create-admin",
    );
    process.exit(1);
  }

  const problem = checkPassword(password);
  if (problem) {
    console.log("Password " + problem + ".");
    process.exit(1);
  }

  const existing = rows(
    await sql.query("select id, role from users where email = $1", [email]),
  );
  if (existing.length > 0) {
    console.log(`${email} already exists (role: ${existing[0].role}). Nothing to do.`);
    process.exit(0);
  }

  await sql.query(
    "insert into users (id, email, password_hash, full_name, role, email_verified, session_version, created_at) values ($1,$2,$3,$4,'admin',true,1,now())",
    [randomBytes(12).toString("hex"), email, bcrypt.hashSync(password, 12), name],
  );

  console.log(`Created admin: ${email}`);
  console.log("Sign in at /login. You can add recruiters from the admin area.");
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});