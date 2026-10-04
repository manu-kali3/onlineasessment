// Grants or revokes site access for an account without a payment.
//
// Access normally comes from a completed payment recorded by the PayHero
// webhook. This is the manual equivalent, for accounts that should not pay —
// the operator's own accounts and test users. Rows are written to payments as
// well as to users.accessGrantedAt so the audit trail shows why access exists
// rather than it appearing from nowhere.
//
//   node scripts/grant-access.cjs someone@example.com
//   node scripts/grant-access.cjs --revoke someone@example.com
const { neon } = require("@neondatabase/serverless");
const { randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local", quiet: true });

const sql = neon(process.env.DATABASE_URL);
const rows = (r) => r.rows ?? r;

// Must mirror src/lib/pricing.ts so the recorded breakdown is truthful.
const PRICE_MINOR = 100_000;
const VAT_MINOR = 5_000;

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    console.log("usage: node scripts/grant-access.cjs [--revoke] you@example.com");
    process.exit(1);
  }

  const found = rows(
    await sql.query("select id, email, role from users where email = $1", [email]),
  );

  if (found.length === 0) {
    console.log(`No account for ${email}.`);
    process.exit(1);
  }

  const user = found[0];

  if (revoke) {
    await sql.query("update users set access_granted_at = null where id = $1", [
      user.id,
    ]);
    console.log(`Revoked access for ${email}.`);
    return;
  }

  const already = rows(
    await sql.query(
      "select access_granted_at from users where id = $1",
      [user.id],
    ),
  )[0];

  if (already?.access_granted_at) {
    console.log(`${email} already has access. Nothing to do.`);
    return;
  }

  await sql.query("update users set access_granted_at = now() where id = $1", [
    user.id,
  ]);

  // Record why access exists, so it is distinguishable from a real payment.
  await sql.query(
    `insert into payments
       (id, user_id, provider, status, amount_minor, vat_minor, total_minor,
        currency, external_reference, completed_at, raw_payload)
     values ($1,$2,'manual','completed',$3,$4,$5,'KES',$6,now(),$7::jsonb)`,
    [
      randomBytes(12).toString("hex"),
      user.id,
      PRICE_MINOR,
      VAT_MINOR,
      PRICE_MINOR + VAT_MINOR,
      `MANUAL-${randomBytes(8).toString("hex")}`,
      JSON.stringify({
        reason: "Manual grant via grant-access script",
        note: "No payment was taken. Treat as revenue = 0 in reporting.",
      }),
    ],
  );

  console.log(`Granted access to ${email} (role: ${user.role}). No payment recorded.`);
  console.log("This account no longer needs to pay to use the portal.");
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});