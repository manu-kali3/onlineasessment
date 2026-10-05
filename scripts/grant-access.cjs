// Grants or revokes course access for an account without a payment.
//
// Access normally comes from a completed payment recorded by the PayHero
// webhook, or from verifying a submitted reference. This is the manual
// equivalent, for accounts that should not pay — the operator's own accounts and
// test users.
//
// Access is per course, so this needs to say which courses. Given no arguments it
// grants every published course, which is almost always what an operator wants
// for their own account.
//
//   node scripts/grant-access.cjs someone@example.com
//   node scripts/grant-access.cjs someone@example.com <assessmentId> [...]
//   node scripts/grant-access.cjs --revoke someone@example.com
//
// A payments row with provider = 'manual' is also written, so access that did not
// come from money stays distinguishable in reporting rather than inflating
// revenue.
const { neon } = require("@neondatabase/serverless");
const { randomBytes } = require("crypto");
require("dotenv").config({ path: ".env.local", quiet: true });

const sql = neon(process.env.DATABASE_URL);
const rows = (r) => r.rows ?? r;

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const positional = args.filter((a) => !a.startsWith("--"));
  const email = (positional[0] || "").trim().toLowerCase();
  const courseIds = positional.slice(1);

  if (!email || !email.includes("@")) {
    console.log(
      "usage: node scripts/grant-access.cjs [--revoke] you@example.com [assessmentId ...]",
    );
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
    // Revoking every course is the default; naming courses revokes just those.
    const targets =
      courseIds.length > 0
        ? courseIds
        : rows(
            await sql.query(
              "select assessment_id from course_access where user_id = $1",
              [user.id],
            ),
          ).map((r) => r.assessment_id);

    if (targets.length === 0) {
      console.log(`${email} has no course access to revoke.`);
      return;
    }

    await sql.query(
      "delete from course_access where user_id = $1 and assessment_id = any($2::text[])",
      [user.id, targets],
    );
    await sql.query("update users set access_granted_at = null where id = $1", [
      user.id,
    ]);

    console.log(
      `Revoked access to ${targets.length} course(s) for ${email}: ${targets.join(", ")}`,
    );
    return;
  }

  // Default to every published course, so an operator's own account just works.
  const targets =
    courseIds.length > 0
      ? courseIds
      : rows(
          await sql.query("select id from assessments where status = 'published'"),
        ).map((r) => r.id);

  if (targets.length === 0) {
    console.log("No published courses to grant. Publish one, or name an id.");
    process.exit(1);
  }

  for (const id of targets) {
    await sql.query(
      `insert into course_access (id, user_id, assessment_id, source, granted_by)
       values ($1, $2, $3, 'admin', $4)
       on conflict (user_id, assessment_id) do nothing`,
      [randomBytes(12).toString("hex"), user.id, id, user.id],
    );
  }

  // Kept in step for the legacy site-wide flag, which reporting still reads.
  await sql.query("update users set access_granted_at = now() where id = $1", [
    user.id,
  ]);

  await sql.query(
    `insert into payments
       (id, user_id, provider, status, amount_minor, vat_minor, total_minor,
        currency, external_reference, completed_at, raw_payload)
     values ($1,$2,'manual','completed',0,0,0,'KES',$3,now(),$4::jsonb)`,
    [
      randomBytes(12).toString("hex"),
      user.id,
      `MANUAL-${randomBytes(8).toString("hex")}`,
      JSON.stringify({
        reason: "Manual grant via grant-access script",
        courses: targets,
        note: "No payment was taken. Treat as revenue = 0 in reporting.",
      }),
    ],
  );

  console.log(
    `Granted ${email} access to ${targets.length} course(s): ${targets.join(", ")}`,
  );
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});