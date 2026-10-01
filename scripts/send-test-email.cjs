// One-off: send a real email through Resend to check delivery.
const { Resend } = require("resend");
require("dotenv").config({ path: ".env.local", quiet: true });

const to = process.argv[2] || process.env.EMAIL_TO;
if (!to) {
  console.log("usage: node scripts/send-test-email.cjs you@example.com");
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

resend.emails
  .send({
    from: process.env.RESEND_FROM,
    to,
    subject: "Assessment Center — email delivery confirmed",
    html: `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#14171f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e2e5ea;border-radius:12px;">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#2f4bd8;">Assessment Center</p>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Email delivery works</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
            This message was sent from the portal through the Resend API, using
            <strong>${process.env.RESEND_FROM}</strong> as the sender.
          </p>
          <p style="margin:0;font-size:15px;line-height:1.6;">
            Account verification and password reset both use this same path.
          </p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#5c6472;border-top:1px solid #e2e5ea;padding-top:16px;">
            If this reached your inbox, transactional email is configured correctly.
            Until a sending domain is verified in Resend, mail can only be delivered
            to Resend's own test addresses.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    text: [
      "Assessment Center — email delivery confirmed.",
      "",
      `Sent via the Resend API from ${process.env.RESEND_FROM}.`,
      "Account verification and password reset both use this same path.",
      "",
      "Until a sending domain is verified in Resend, mail can only be delivered",
      "to Resend's own test addresses.",
    ].join("\n"),
  })
  .then(({ data, error }) => {
    if (error) {
      console.log("FAILED:", error.message);
      process.exit(1);
    }
    console.log("SENT");
    console.log("  id      :", data.id);
    console.log("  to      :", to);
    console.log("  from    :", process.env.RESEND_FROM);
  })
  .catch((e) => {
    console.log("THREW:", e.message);
    process.exit(1);
  });