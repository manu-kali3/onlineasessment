/**
 * Pricing for site access.
 *
 * Amounts are integer minor units (cents). The VAT-inclusive total is derived
 * here and nowhere else: a client-supplied total is never trusted, because the
 * client is the party being charged.
 */

export const CURRENCY = "KES";

/** Net charge before VAT. */
export const ACCESS_PRICE_MINOR = 100_000; // 1000.00 KES

/** Flat VAT added on top of the net price. */
export const ACCESS_VAT_MINOR = 5_000; // 50.00 KES

export const ACCESS_TOTAL_MINOR = ACCESS_PRICE_MINOR + ACCESS_VAT_MINOR; // 1050.00

export function formatKes(minor: number) {
  return `KES ${(minor / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type PriceBreakdown = {
  amountMinor: number;
  vatMinor: number;
  totalMinor: number;
  currency: string;
};

/**
 * Normalises a Kenyan phone number to the 2547XXXXXXXX form PayHero expects.
 * Accepts 0712345678, +254712345678, 254712345678 and 254 712 345 678.
 * Returns null when it cannot be trusted, so checkout can ask again rather
 * than sending a malformed STK push that will be rejected at the provider.
 */
export function normaliseKenyanPhone(input: string): string | null {
  const cleaned = input.replace(/[\s()-]/g, "");
  if (!/^\+?\d{9,15}$/.test(cleaned)) return null;

  let digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  if (digits.startsWith("0")) {
    digits = `254${digits.slice(1)}`;
  } else if (digits.startsWith("254")) {
    // already correct
  } else if (digits.startsWith("7") && digits.length === 9) {
    digits = `254${digits}`;
  } else {
    return null;
  }

  // Kenyan mobile numbers are 254 followed by a 9-digit number starting with 7.
  if (!/^2547\d{8}$/.test(digits)) return null;
  return digits;
}
