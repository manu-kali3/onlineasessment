import { Resend } from "resend";
import { env, canSendEmail } from "./env";

/**
 * Transactional email via Resend.
 *
 * When RESEND_API_KEY is absent the message is logged instead of sent, so the
 * app remains usable locally. That fallback is only ever appropriate in
 * development: a production instance with no key silently swallows every
 * verification and reset email, which is exactly the kind of failure nobody
 * notices until a candidate cannot get in. So we log loudly here and surface it
 * on the login page via `canSendEmail`.
 */
export type EmailResult = {
  delivered: boolean;
  reason?: string;
};

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  if (!canSendEmail) {
    const level = process.env.NODE_ENV === "production" ? "error" : "info";
    console[level](
      `[email] NOT SENT to=${to} subject=${JSON.stringify(subject)} — RESEND_API_KEY is not set, so the message was only logged.` +
        (level === "error"
          ? " Set RESEND_API_KEY and RESEND_FROM in the deployment environment, otherwise every verification and reset email is lost."
          : ""),
    );
    return { delivered: false, reason: "email_not_configured" };
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error(`[email] Resend rejected ${to}: ${error.message}`);
      return { delivered: false, reason: error.message };
    }

    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown send failure";
    console.error(`[email] send to ${to} threw: ${message}`);
    return { delivered: false, reason: message };
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * Shared shell. Deliberately table-based and inline-styled: email clients strip
 * <style> blocks and have inconsistent flex/grid support.
 */
function layout(heading: string, body: string, cta: { label: string; url: string }) {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#14171f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e5ea;border-radius:12px;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:.02em;color:#2f4bd8;">Assessment Center</p>
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">${heading}</h1>
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                <a href="${cta.url}"
                   style="display:inline-block;background:#2f4bd8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">
                  ${cta.label}
                </a>
                <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#5c6472;">
                  This link expires in ${expiryNote}. If the button does not work,
                  copy this URL into your browser:<br>
                  <span style="word-break:break-all;">${cta.url}</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;border-top:1px solid #e2e5ea;">
                <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#5c6472;">
                  If you did not request this email you can safely ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

const expiryNote = "60 minutes";

export async function sendVerificationEmail({
  to,
  name,
  url,
}: {
  to: string;
  name: string;
  url: string;
}): Promise<EmailResult> {
  const body = `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
    Hi ${escapeHtml(name)}, thanks for registering. Confirm your email address to
    activate your account. You will need a verified address before you can sign in
    or start an assessment.
  </p>`;

  return sendEmail({
    to,
    subject: "Confirm your email address",
    html: layout("Confirm your email", body, { label: "Verify email", url }),
    text: [
      `Hi ${name},`,
      "",
      "Confirm your email address to activate your account:",
      url,
      "",
      "This link expires in 60 minutes.",
      "If you did not register, you can ignore this email.",
    ].join("\n"),
  });
}

export async function sendPasswordResetEmail({
  to,
  name,
  url,
}: {
  to: string;
  name: string;
  url: string;
}): Promise<EmailResult> {
  const body = `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
    Hi ${escapeHtml(name)}, we received a request to reset your password. Choose a
    new one using the link below. Your current password stays active until you do.
  </p>`;

  return sendEmail({
    to,
    subject: "Reset your password",
    html: layout("Reset your password", body, { label: "Choose a new password", url }),
    text: [
      `Hi ${name},`,
      "",
      "Reset your password:",
      url,
      "",
      "This link expires in 60 minutes.",
      "If you did not request this, your password is unchanged and you can ignore this email.",
    ].join("\n"),
  });
}

/** Escape untrusted values before interpolating them into HTML. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}