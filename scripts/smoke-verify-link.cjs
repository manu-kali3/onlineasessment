// Guards the emailed verification link.
//
// This was a real bug: the email pointed at /verify-email, which only renders a
// `status` param, while the route that consumes the token lives at
// /api/auth/verify-email. Clicking the link therefore showed "pending" forever
// and never verified anything. These assertions check the emailed path and the
// resulting state, not just that a string appears somewhere.
const BASE = process.env.BASE || "http://localhost:3195";
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)})`}`,
    );

  const email = `linkcheck${Date.now()}@gmail.com`;
  const resendUrl = await fetch(`${BASE}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const resendBody = await resendUrl.json();

  console.log("=== emailed link points at the consuming route ===");
  // With no sending key configured the response exposes the link for local use.
  const link =
    resendBody.devVerifyUrl ??
    (await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Link Check",
        email,
        password: "a sufficiently long passphrase 12",
      }),
    })
      .then((r) => r.json())
      .then((b) => b.devVerifyUrl));

  pass("a verification link was produced", Boolean(link), true);

  if (!link) {
    console.log(
      "\nThis needs the link the app would have emailed, so run it against a\n" +
        "server whose Resend key is deliberately invalid. The send then fails and\n" +
        "the API returns the link in `devVerifyUrl`:\n\n" +
        "  $env:RESEND_API_KEY='re_invalid'; npx next start -p 3197\n" +
        "  $env:BASE='http://localhost:3197'; node scripts/smoke-verify-link.cjs\n\n" +
        "(An empty RESEND_API_KEY is not enough: Next falls back to .env.local.)",
    );
    process.exitCode = 1;
    return;
  }

  const parsed = new URL(link);
  pass("path is the API route", parsed.pathname, "/api/auth/verify-email");
  pass("carries a token", parsed.searchParams.has("token"), true);
  pass("does not point at the result page", parsed.pathname !== "/verify-email", true);

  console.log("\n=== following that link verifies the account ===");
  // Reach the same token the app issued, via the database, then follow the real
  // emailed path.
  const [user] = rows(await sql.query("select id from users where email = $1", [email]));
  let token = null;
  if (link) token = new URL(link).searchParams.get("token");

  if (!user || !token) {
    console.log("SKIP  could not derive a live token for the state check");
    return;
  }

  const final = await fetch(link, { redirect: "follow" });
  const html = await final.text();
  pass("final url carries success", final.url.includes("status=success"), true);
  pass("page says confirmed", html.includes("Email confirmed"), true);
  pass("page no longer says pending", html.includes("pending"), false);

  const [after] = rows(
    await sql.query("select email_verified from users where id = $1", [user.id]),
  );
  pass("email_verified is true", after.email_verified, true);

  const [tok] = rows(
    await sql.query(
      "select consumed_at from auth_tokens where user_id = $1 and purpose = 'email_verification'",
      [user.id],
    ),
  );
  pass("token consumed", tok?.consumed_at != null, true);

  console.log("\n=== the link is single use ===");
  const replay = await fetch(link, { redirect: "follow" });
  const replayHtml = await replay.text();
  pass("replay lands on invalid", replayHtml.includes("Link invalid or expired"), true);

  await sql.query("delete from users where id = $1", [user.id]);
  console.log("\ncleanup done");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});