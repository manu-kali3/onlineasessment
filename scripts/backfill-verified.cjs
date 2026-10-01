// Backfill: demo users were created before `email_verified` existed, so they
// default to false and cannot sign in. Staff and seeded candidates are all
// known-good, so mark them verified.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });

const sql = neon(process.env.DATABASE_URL);

const VERIFIED = [
  "admin@portal.test",
  "recruiter@portal.test",
  "assessor@portal.test",
  "candidate@portal.test",
  "jordan@portal.test",
  "priya@portal.test",
];

async function main() {
  const res = await sql.query(
    "update users set email_verified = true where email = any($1::text[]) returning email",
    [VERIFIED],
  );
  const rows = res.rows ?? res;
  console.log("verified:", rows.map((r) => r.email).join(", "));
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});