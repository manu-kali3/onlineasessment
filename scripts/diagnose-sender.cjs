// Compares the current sender against the verified domain, since
// onboarding@resend.dev is a test-only address restricted to the account owner.
const { Resend } = require("resend");
require("dotenv").config({ path: ".env.local", quiet: true });

const resend = new Resend(process.env.RESEND_API_KEY);

async function trySend(label, from, to) {
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `Probe: ${label}`,
    html: `<p>Probe from <code>${from}</code></p>`,
    text: `Probe from ${from}`,
  });

  if (error) {
    console.log(`${label}\n  REJECTED: ${error.message}`);
    return;
  }

  let event = "(none)";
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    const { data: one } = await resend.emails.get(data.id);
    event = one?.last_event ?? event;
    if (["delivered", "bounced", "failed", "rejected"].includes(event)) break;
  }
  console.log(`${label}\n  accepted id=${data.id}\n  last_event=${event}`);
}

async function main() {
  const to = process.env.PROBE_TO || "manukorir161@gmail.com";
  const domain = process.env.VERIFIED_DOMAIN || "brevansoftwares.co.ke";

  await trySend("current sender (onboarding@resend.dev)", process.env.RESEND_FROM, to);
  console.log("");
  await trySend("verified domain", `Assessment Center <no-reply@${domain}>`, to);
}

main().catch((e) => console.log("ERR:", e.message));