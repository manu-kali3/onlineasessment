/**
 * Pricing helpers.
 *
 * Amounts are integer minor units (cents) throughout. There are deliberately no
 * global price constants here: the amount a candidate owes is a property of the
 * course they enrolled in, read from `assessments.priceMinor`, and a module
 * constant is exactly how a stale price would silently get charged again.
 */

export const CURRENCY = "KES";

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
