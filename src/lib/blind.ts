import type { User, Attempt } from "@/db/schema";

export type BlindCandidate = {
  candidateRef: string;
  attemptId: string;
  score: number | null;
  status: Attempt["status"];
  submittedAt: Date | null;
};

/**
 * Blind-review projection: strips name, email, DOB and gender so assessors
 * cannot infer identity before submitting scores. `candidateRef` is a stable
 * per-attempt pseudonym shown in place of the name.
 */
export function toBlindCandidate(
  attempt: Attempt,
  user: Pick<User, "id" | "fullName"> | undefined,
  index: number,
): BlindCandidate {
  return {
    candidateRef: `${String(index + 1).padStart(3, "0")}-${shortHash(attempt.id)}`,
    attemptId: attempt.id,
    score: attempt.score,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
  };
}

function shortHash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}

/** Full identity view — only for admins, never for blind-mode assessors. */
export function toIdentifiedCandidate(
  attempt: Attempt,
  user: Pick<User, "fullName" | "email"> | undefined,
) {
  return {
    attemptId: attempt.id,
    candidateName: user?.fullName ?? "Unknown",
    candidateEmail: user?.email ?? "—",
    score: attempt.score,
    status: attempt.status,
  };
}