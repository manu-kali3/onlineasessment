// Diagnoses Resend delivery: domain status, recent send outcomes, and a live
// probe. Resend returning an id means "accepted for delivery", not "delivered".
const { Resend } = require("resend");
require("dotenv").config({ path: ".env.local", quiet: true });

const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  console.log("=== config ===");
  console.log("RESEND_FROM :", process.env.RESEND_FROM);
  console.log(
    "RESEND_API_KEY:",
    process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.slice(0, 8)}...` : "MISSING",
  );

  console.log("\n=== domains ===");
  const { data: domains, error: domErr } = await resend.domains.list();
  if (domErr) {
    console.log("could not list domains:", domErr.message);
  } else {
    const list = domains?.data ?? [];
    if (list.length === 0) console.log("(no domains configured)");
    for (const d of list) {
      console.log(
        `  ${d.name}  status=${d.status}  region=${d.region ?? "-"}`,
      );
    }
  }

  console.log("\n=== recent messages ===");
  const { data, error } = await resend.emails.list({ limit: 10 });
  if (error) {
    console.log("could not list messages:", error.message);
  } else {
    for (const m of data?.data ?? []) {
      console.log(
        `  ${new Date(m.created_at).toISOString().slice(0, 19)}  ${String(m.to?.[0]).padEnd(32)} last_event=${m.last_event}`,
      );
    }
  }

  console.log("\n=== live probe to the account owner address ===");
  const owner = process.env.PROBE_TO || "manukorir161@gmail.com";
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: process.env.RESEND_FROM,
    to: owner,
    subject: "Delivery probe",
    html: "<p>probe</p>",
    text: "probe",
  });
  if (sendErr) {
    console.log("  SEND FAILED:", sendErr.message);
    return;
  }
  console.log("  accepted, id:", sent.id);

  // Poll for a terminal event rather than assuming acceptance means delivery.
  console.log("  polling for delivery event...");
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data: one } = await resend.emails.get(sent.id);
    const ev = one?.last_event;
    console.log(`    t+${(i + 1) * 1.5}s  last_event=${ev}`);
    if (["delivered", "bounced", "failed", "rejected", "complained"].includes(ev)) {
      break;
    }
  }
}

main().catch((e) => {
  console.log("ERR:", e.message);
});