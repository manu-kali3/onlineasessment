// Marks one seeded course as paid so the per-course payment flow can be
// exercised. Idempotent: re-running sets the same values.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function main() {
  const target = process.argv[2] || "asmt-ai-fundamentals";
  const price = Number(process.argv[3] || 100000);
  const vat = Number(process.argv[4] || 5000);

  const res = await sql.query(
    "update assessments set price_minor = $1, vat_minor = $2 where id = $3 returning id, title, price_minor, vat_minor",
    [price, vat, target],
  );

  const row = rows(res)[0];
  if (!row) {
    console.log(`No assessment with id ${target}.`);
    process.exit(1);
  }

  console.log(`Set ${row.title} to ${(row.price_minor / 100).toFixed(2)} + ${(row.vat_minor / 100).toFixed(2)} VAT`);
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});