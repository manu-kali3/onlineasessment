// Resets the jordan/att-2 fixture so scripts/smoke-flow.cjs can run repeatedly.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });

const sql = neon(process.env.DATABASE_URL);

async function main() {
  await sql.query("delete from responses");
  await sql.query("delete from attempts");
  await sql.query(
    "update assessment_invitations set status = 'invited' where id = 'inv-2'",
  );
  const res = await sql.query("select count(*)::int as c from attempts");
  const rows = res.rows ?? res;
  console.log("attempts now:", rows[0].c);
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});