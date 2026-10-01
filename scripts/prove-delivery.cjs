// End-to-end proof that a verification email is actually handed to Resend and
// delivered, using the current RESEND_FROM.
const { Resend } = require("resend");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = require("@neondatabase/serverless").neon(process.env.DATABASE_URL);

const BASE = process.env.BASE || "http://localhost:3180";
const TO = process.env.PROBE_TO || "manukorir161@gmail.com";
const resend = new Resend(process.env.RESEND_API_KEY);

const rows = (r) => r.rows ?? r;

async function main() {
  console.log("RESEND_FROM:", process.env.RESEND_FROM);
  // Must be a mailbox that really exists, otherwise the provider bounces it
  // and the test would blame the app for the recipient being fake.
  const email = TO;

  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Delivery Proof",
      email,
      password: "a sufficiently long passphrase 4",
    }),
  });
  const body = await res.json();

  console.log("\nregister status :", res.status);
  console.log("status field    :", body.status);
  console.log("devVerifyUrl    :", body.devVerifyUrl ? "PRESENT (email NOT sent)" : "absent");

  if (body.devVerifyUrl) {
    console.log("\nVERDICT: still not sending email.");
    return;
  }

  // Find the message Resend actually accepted for this recipient.
  let found = null;
  for (let i = 0; i < 8 && !found; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await resend.emails.list({ limit: 10 });
    found = (data?.data ?? []).find((m) => m.to?.[0] === email);
  }

  if (!found) {
    console.log("\nVERDICT: app reported success but Resend has no message for", email);
    return;
  }

  console.log("\nResend accepted a message for the registered address:");
  console.log("  id         :", found.id);
  console.log("  from       :", found.from);
  console.log("  to         :", JSON.stringify(found.to));
  console.log("  subject    :", found.subject);

  let event = found.last_event;
  for (let i = 0; i < 8; i++) {
    if (["delivered", "bounced", "failed", "rejected"].includes(event)) break;
    await new Promise((r) => setTimeout(r, 1500));
    const { data: one } = await resend.emails.get(found.id);
    event = one?.last_event ?? event;
  }
  console.log("  last_event :", event);

  const ok = ["delivered", "opened"].includes(event);
  console.log("\nVERDICT:", ok ? "email sent and delivered" : `NOT delivered (${event})`);

  await sql.query("delete from auth_tokens where user_id in (select id from users where email = $1)", [email]);
  await sql.query("delete from users where email = $1", [email]);
  console.log("cleanup done");
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});