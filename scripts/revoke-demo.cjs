// Deletes the seeded demo accounts and everything hanging off them.
//
// Destructive and irreversible. The demo users share a published password, so
// they must not exist on a public deployment. Run this against production.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const DEMO = [
  "admin@portal.test",
  "recruiter@portal.test",
  "assessor@portal.test",
  "candidate@portal.test",
  "jordan@portal.test",
  "priya@portal.test",
];

const rows = (r) => r.rows ?? r;

async function main() {
  if (process.argv.includes("--yes") !== true) {
    console.log("This deletes the demo accounts and their attempts.");
    console.log("Accounts:");
    console.log("  " + DEMO.join("\n  "));
    console.log("\nRe-run with --yes to proceed.");
    return;
  }

  // Show what will go before removing it.
  const before = rows(
    await sql.query("select id, email from users where email = any($1::text[])", [DEMO]),
  );
  if (before.length === 0) {
    console.log("No demo accounts present. Nothing to do.");
    return;
  }
  console.log(`Removing ${before.length} demo accounts:`);
  for (const u of before) console.log("  " + u.email);

  // responses and proctor_events cascade from attempts; invitations cascade from
  // nothing, so clear them explicitly.
  await sql.query(
    "delete from assessment_invitations where candidate_id in (select id from users where email = any($1::text[]))",
    [DEMO],
  );
  await sql.query("delete from users where email = any($1::text[])", [DEMO]);

  const after = rows(
    await sql.query("select count(*)::int as c from users where email = any($1::text[])", [DEMO]),
  );
  console.log(`\nDemo accounts remaining: ${after[0].c}`);

  const remaining = rows(await sql.query("select count(*)::int as c from users"));
  console.log(`Total accounts remaining: ${remaining[0].c}`);
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});