// Removes unverified accounts left behind by test runs. Verified accounts are
// left alone: they may hold real attempt data.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function main() {
  const junk = rows(
    await sql.query(
      "select id, email, created_at from users where email_verified = false order by created_at",
    ),
  );

  if (junk.length === 0) {
    console.log("No unverified accounts to remove.");
    return;
  }

  console.log(`Removing ${junk.length} unverified account(s):`);
  for (const u of junk) {
    console.log(`   ${u.email}  (created ${new Date(u.created_at).toISOString()})`);
  }

  for (const u of junk) {
    await sql.query("delete from users where id = $1", [u.id]);
  }

  const left = rows(await sql.query("select email from users order by email"));
  console.log("\nRemaining accounts:");
  for (const u of left) console.log("   " + u.email);
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});