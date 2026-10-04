// Sets a known password for an account. Useful when a test fixture left an
// unusable hash behind, or when rotating a password without going through the
// emailed reset flow.
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local", quiet: true });

const sql = neon(process.env.DATABASE_URL);
const rows = (r) => r.rows ?? r;

function checkPassword(pw) {
  if (pw.length < 12) return "at least 12 characters";
  if (Buffer.byteLength(pw, "utf8") > 72) return "under 72 bytes";
  return null;
}

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.log("usage: node scripts/set-password.cjs you@example.com '<12+ chars>'");
    process.exit(1);
  }

  const problem = checkPassword(password);
  if (problem) {
    console.log(`Password must be ${problem}.`);
    process.exit(1);
  }

  const found = rows(
    await sql.query("select id, email from users where email = $1", [
      email.toLowerCase(),
    ]),
  );
  if (found.length === 0) {
    console.log(`No account for ${email}.`);
    process.exit(1);
  }

  await sql.query(
    // Bump the session version so any existing cookie for this account stops
    // working, which is what a password change should do.
    "update users set password_hash = $1, session_version = session_version + 1 where id = $2",
    [bcrypt.hashSync(password, 12), found[0].id],
  );

  console.log(`Password updated for ${found[0].email}.`);
  console.log("Existing sessions for this account were signed out.");
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});