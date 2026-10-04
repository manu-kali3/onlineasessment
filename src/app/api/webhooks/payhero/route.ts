import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { databaseUnavailable } from "@/lib/api-guard";
import { grantAccessForPayment } from "@/lib/access";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * PayHero payment callback.
 *
 * Three things matter here:
 *
 * 1. Authentication. A webhook is a public URL, so an unauthenticated caller
 *    could otherwise mark themselves paid. PayHero sends an Authorization header
 *    carrying the same basic credentials; we require it.
 *
 * 2. Idempotency. PayHero retries until it gets a 2xx, so the same callback will
 *    arrive more than once. `grantAccessForPayment` only transitions a row from
 *    pending to completed, so repeats are no-ops.
 *
 * 3. Amount agreement. We compare what PayHero says was paid against the total we
 *    recorded. A mismatch is logged and refused rather than granting access,
 *    because a partial or tampered callback must not unlock the site.
 */

function authorised(req: Request): boolean {
  const expected = process.env.PAYHERO_AUTH_TOKEN;
  // No token configured means we cannot authenticate the caller at all, so fail
  // closed rather than accepting an unauthenticated webhook.
  if (!expected) return false;

  const received = req.headers.get("authorization");
  if (!received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Signature check for providers that sign the body instead of using Basic auth. */
function signatureValid(raw: string, header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header.toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

export async function POST(req: Request) {
  const unavailable = databaseUnavailable();
  if (unavailable) return unavailable;

  const raw = await req.text();

  const basicOk = authorised(req);
  const sigOk = signatureValid(
    raw,
    req.headers.get("x-payhero-signature") ?? req.headers.get("x-signature"),
    process.env.PAYHERO_WEBHOOK_SECRET,
  );

  if (!basicOk && !sigOk) {
    console.warn("[paywall] rejected an unauthenticated PayHero callback");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reference =
    pickString(
      payload,
      "external_reference",
      "externalReference",
      "reference",
      "merchant_reference",
    ) ?? null;

  if (!reference) {
    console.warn("[paywall] PayHero callback had no external reference");
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const status = (
    pickString(payload, "status", "state", "transaction_status") ?? ""
  ).toLowerCase();

  const succeeded =
    status === "success" ||
    status === "successful" ||
    status === "completed" ||
    status === "paid" ||
    status === "confirmed";

  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.externalReference, reference))
    .limit(1);

  if (!row) {
    // Unknown reference: record nothing and do not grant access.
    console.warn(`[paywall] callback for unknown reference ${reference}`);
    return NextResponse.json({ ok: true, matched: false });
  }

  await db
    .update(payments)
    .set({ rawPayload: { ...(row.rawPayload ?? {}), callback: payload } })
    .where(eq(payments.id, row.id));

  if (!succeeded) {
    // A failure callback must revoke nothing but must not grant anything either.
    if (status) {
      await db
        .update(payments)
        .set({ status: "failed", failureReason: `provider status: ${status}` })
        .where(
          and(eq(payments.id, row.id), eq(payments.status, "pending")),
        );
    }
    console.log(`[paywall] callback for ${reference} reported "${status}"`);
    return NextResponse.json({ ok: true, matched: true, granted: false });
  }

  // Verify the amount actually paid matches what we asked for.
  const reported = pickString(payload, "amount", "total", "amount_paid");
  if (reported !== null) {
    const reportedMinor = Math.round(Number(reported) * 100);
    if (Number.isFinite(reportedMinor) && reportedMinor !== row.totalMinor) {
      console.error(
        `[paywall] amount mismatch on ${reference}: expected ${row.totalMinor} minor, provider said ${reportedMinor}. Access NOT granted.`,
      );
      return NextResponse.json({ error: "Amount mismatch" }, { status: 409 });
    }
  }

  const granted = await grantAccessForPayment(row.id);
  console.log(
    `[paywall] ${reference} completed. access granted: ${granted}`,
  );

  return NextResponse.json({ ok: true, matched: true, granted });
}

/** PayHero may probe with GET to confirm the endpoint exists. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "payhero-webhook" });
}
