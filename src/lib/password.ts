/**
 * Password policy for self-service credentials.
 *
 * Deliberately length-first: NIST guidance favours length over composition
 * rules, since forcing symbols and periodic rotation pushes people toward
 * predictable substitutions. The only hard requirement is a minimum length;
 * the rest are strength signals surfaced as feedback rather than rejections,
 * because a rejected password that leaks the rule set is worse than a slightly
 * weak one the candidate chose deliberately.
 */
export const MIN_PASSWORD_LENGTH = 12;

// bcrypt only considers the first 72 bytes, so reject anything longer rather
// than silently truncating.
export const MAX_PASSWORD_BYTES = 72;

export type PasswordCheck = {
  ok: boolean;
  error?: string;
  score: 0 | 1 | 2 | 3 | 4;
  feedback: string[];
};

export function checkPassword(password: string): PasswordCheck {
  const feedback: string[] = [];

  // Count UTF-16 code units, but the byte cap is what actually matters for bcrypt.
  const length = [...password].length;
  const bytes = Buffer.byteLength(password, "utf8");

  if (length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      score: 0,
      feedback,
    };
  }

  if (bytes > MAX_PASSWORD_BYTES) {
    return {
      ok: false,
      error: `Password must be under ${MAX_PASSWORD_BYTES} bytes when encoded.`,
      score: 0,
      feedback,
    };
  }

  let score: PasswordCheck["score"] = 1;
  if (length >= 16) {
    score = 2;
    feedback.push("Good length.");
  } else {
    feedback.push("16 or more characters is stronger.");
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;

  if (classes >= 3) {
    score = Math.min(4, score + 1) as PasswordCheck["score"];
    feedback.push("Mixes character types well.");
  } else {
    feedback.push("Mixing upper case, lower case, digits, or symbols adds strength.");
  }

  // Penalise the obvious substitutions attackers try first.
  const lowered = password.toLowerCase();
  const weak = [
    "password",
    "qwerty",
    "letmein",
    "welcome",
    "admin",
    "iloveyou",
    "assessment",
    "123456",
  ];
  if (weak.some((w) => lowered.includes(w))) {
    score = 1;
    feedback.push("Avoid common words.");
  }

  if (/^(.)\1+$/.test(password)) {
    score = 0;
    feedback.push("Avoid repeating a single character.");
  }

  return { ok: true, score, feedback };
}

export function scoreLabel(score: number) {
  if (score >= 4) return "Strong";
  if (score === 3) return "Good";
  if (score === 2) return "Fair";
  return "Weak";
}