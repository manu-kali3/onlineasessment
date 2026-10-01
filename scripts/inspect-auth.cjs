// Inspects users and auth tokens, to see whether a reset token is being issued.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function main() {
  const users = await sql.query(
    "select email, role, email_verified, session_version, created_at from users order by created_at",
  );
  console.log("USERS:");
  for (const u of rows(users)) {
    console.log(
      `   ${u.email.padEnd(34)} ${String(u.role).padEnd(10)} verified=${u.email_verified} sv=${u.session_version}`,
    );
  }

  const tokens = await sql.query(
    `select purpose,
            count(*)::int as total,
            sum(case when consumed_at is null then 1 else 0 end)::int as live,
            max(created_at) as newest
     from auth_tokens group by purpose order by purpose`,
  );
  console.log("\nTOKENS:");
  for (const t of rows(tokens)) {
    console.log(
      `   ${String(t.purpose).padEnd(20)} total=${t.total} live=${t.live} newest=${t.newest}`,
    );
  }

  const recent = await sql.query(
    `select purpose, created_at, expires_at, consumed_at
     from auth_tokens order by created_at desc limit 5`,
  );
  console.log("\nMOST RECENT:");
  for (const t of rows(recent)) {
    console.log(
      `   ${String(t.purpose).padEnd(20)} created=${t.created_at} expires=${t.expires_at} consumed=${t.consumed_at}`,
    );
  }
}

main().catch((e) => console.log("ERR:", e.message));