import { env } from "./env";

/**
 * PayHero API client (M-Pesa STK push).
 *
 * Docs: https://docs.payhero.co.ke
 * Base:  https://backend.payhero.co.ke/api/v2
 *
 * Secrets are read from the server environment only and are never sent to the
 * browser: the token is minted per request from the username and password so it
 * does not have to be stored at all.
 */

const BASE = "https://backend.payhero.co.ke/api/v2";

export type StkPushResult =
  | { ok: true; providerReference?: string; raw: Record<string, unknown> }
  | { ok: false; message: string; status: number; raw?: Record<string, unknown> };

export type StkPushInput = {
  amount: number;
  phoneNumber: string;
  channelId: string;
  externalReference: string;
  callbackUrl: string;
  /** Defaults to m-pesa; PayHero also supports card and bank channels. */
  provider?: string;
  name?: string;
  email?: string;
};

export function payHeroConfigured() {
  return Boolean(env.PAYHERO_USERNAME && env.PAYHERO_PASSWORD);
}

/** The channel id is what routes the money to a specific paybill/till. */
export function payHeroChannelConfigured() {
  return Boolean(env.PAYHERO_CHANNEL_ID);
}

function authHeader() {
  const basic = Buffer.from(
    `${env.PAYHERO_USERNAME}:${env.PAYHERO_PASSWORD}`,
    "utf8",
  ).toString("base64");
  return `Basic ${basic}`;
}

/**
 * Sends an M-Pesa STK push.
 *
 * A 2xx here means the push was accepted for delivery, NOT that money moved —
 * the customer still has to authorise on their handset. Completion arrives on
 * the callback, which is why nothing grants access at this point.
 */
export async function initiateStkPush(
  input: StkPushInput,
): Promise<StkPushResult> {
  if (!payHeroConfigured()) {
    return {
      ok: false,
      status: 0,
      message: "Payment provider is not configured on this deployment.",
    };
  }

  const payload: Record<string, unknown> = {
    amount: input.amount,
    phone_number: input.phoneNumber,
    channel_id: input.channelId,
    provider: input.provider ?? "m-pesa",
    external_reference: input.externalReference,
    callback_url: input.callbackUrl,
  };
  if (input.name) payload.name = input.name;
  if (input.email) payload.email = input.email;

  let res: Response;
  try {
    res = await fetch(`${BASE}/payments/initiate-stk-push`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message:
        err instanceof Error
          ? `Could not reach the payment provider: ${err.message}`
          : "Could not reach the payment provider.",
    };
  }

  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    raw = { raw: text.slice(0, 300) };
  }

  if (!res.ok) {
    const message =
      (raw.status as string) ||
      (raw.message as string) ||
      (raw.error_message as string) ||
      `Payment provider rejected the request (HTTP ${res.status}).`;
    return { ok: false, status: res.status, message, raw };
  }

  const providerReference =
    (raw.id as string) ||
    (raw.reference as string) ||
    (raw.transaction_reference as string) ||
    undefined;

  return { ok: true, providerReference, raw };
}

/**
 * Confirms a transaction's status with PayHero. Used as a fallback when a
 * callback is missed, so a payment is never silently lost because a webhook
 * did not arrive.
 */
export async function getTransactionStatus(
  reference: string,
): Promise<{ ok: boolean; raw?: Record<string, unknown>; message?: string }> {
  if (!payHeroConfigured()) {
    return { ok: false, message: "Payment provider is not configured." };
  }

  try {
    const res = await fetch(
      `${BASE}/payments/transaction/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: authHeader(),
          Accept: "application/json",
        },
      },
    );
    const text = await res.text();
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    return { ok: true, raw: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "request failed",
    };
  }
}
