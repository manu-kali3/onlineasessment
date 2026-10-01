/**
 * Seeds an "AI Fundamentals" quiz: five single-answer multiple-choice items.
 *
 * Unlike the web-development pack, every item has one unambiguous correct
 * option, so these auto-grade on submit and produce a real score immediately —
 * no assessor pass required.
 *
 * The supplied material listed four options per question and a single correct
 * answer. Distractors are reproduced verbatim so a wrong pick still means the
 * candidate picked a plausible-sounding alternative rather than a typo.
 *
 * Idempotent: safe to re-run. New candidates are picked up on each run.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  assessmentCompetencies,
  assessmentInvitations,
  assessmentQuestions,
  assessments,
  competencies,
  questions,
  users,
} from "../src/db/schema";
import { hashToken } from "../src/lib/tokens";
import { newToken } from "../src/lib/id";

const COMPETENCIES = [
  {
    id: "cmp-ai-foundations",
    name: "AI Foundations",
    description: "Core terminology, history, and the main branches of AI.",
  },
  {
    id: "cmp-ai-training",
    name: "AI Training",
    description: "How models are trained, including gradients and reward.",
  },
];

type SeedQuestion = typeof questions.$inferInsert;

const opt = (id: string, label: string) => ({ id, label });

const QUESTION_BANK: SeedQuestion[] = [
  {
    id: "ai-agi",
    type: "multiple_choice",
    prompt: "What does the term AGI stand for in the field of artificial intelligence?",
    options: [
      opt("a", "Automated Generative Input"),
      opt("b", "Artificial General Intelligence"),
      opt("c", "Applied Grid Infrastructure"),
      opt("d", "Algorithmic Global Intelligence"),
    ],
    // "b"
    correctAnswer: "b",
    competencyId: "cmp-ai-foundations",
    difficulty: 0.2,
    timeLimitSec: 60,
    isValidated: true,
    rubric: [
      {
        criterion: "Answer",
        weight: 1,
        levels: [
          "B — Artificial General Intelligence",
          "AGI is the hypothetical general-purpose system; today's AI is narrow (ANI)",
        ],
      },
    ],
  },
  {
    id: "ai-turing",
    type: "multiple_choice",
    prompt:
      "Proposed in 1950, what is the name of the famous test designed to determine whether a machine can exhibit intelligent behaviour indistinguishable from that of a human?",
    options: [
      opt("a", "The Lovelace Paradigm"),
      opt("b", "The Asimov Protocol"),
      opt("c", "The Turing Test"),
      opt("d", "The McCarthy Standard"),
    ],
    // "c"
    correctAnswer: "c",
    competencyId: "cmp-ai-foundations",
    difficulty: 0.2,
    timeLimitSec: 60,
    isValidated: true,
    rubric: [
      {
        criterion: "Answer",
        weight: 1,
        levels: [
          "C — The Turing Test",
          "A human judge converses with a machine and a human; the test passes if the judge cannot reliably tell them apart",
        ],
      },
    ],
  },
  {
    id: "ai-computer-vision",
    type: "multiple_choice",
    prompt:
      "Which specific branch of AI focuses on enabling computers to derive meaningful information from digital images, videos, and other visual inputs?",
    options: [
      opt("a", "Natural Language Processing (NLP)"),
      opt("b", "Computer Vision"),
      opt("c", "Expert Systems"),
      opt("d", "Predictive Analytics"),
    ],
    // "b"
    correctAnswer: "b",
    competencyId: "cmp-ai-foundations",
    difficulty: 0.2,
    timeLimitSec: 60,
    isValidated: true,
    rubric: [
      {
        criterion: "Answer",
        weight: 1,
        levels: [
          "B — Computer Vision",
          "Powers facial recognition, self-driving navigation, and medical image analysis",
        ],
      },
    ],
  },
  {
    id: "ai-backprop",
    type: "multiple_choice",
    prompt:
      'In training neural networks, what is the name of the algorithm used to calculate the gradient of the loss function and adjust the "weights" by working backward from the output?',
    options: [
      opt("a", "Backpropagation"),
      opt("b", "Forward routing"),
      opt("c", "Random foresting"),
      opt("d", "Gradient boosting"),
    ],
    // "a"
    correctAnswer: "a",
    competencyId: "cmp-ai-training",
    difficulty: 0.35,
    timeLimitSec: 90,
    isValidated: true,
    rubric: [
      {
        criterion: "Answer",
        weight: 1,
        levels: [
          "A — Backpropagation",
          'Short for "backward propagation of errors"; the technique that lets deep models learn from their mistakes',
        ],
      },
    ],
  },
  {
    id: "ai-reinforcement",
    type: "multiple_choice",
    prompt:
      'If an AI system is trained by being placed in an environment where it learns through trial and error — earning "rewards" for good actions and "penalties" for bad ones — what kind of learning is this?',
    options: [
      opt("a", "Supervised Learning"),
      opt("b", "Unsupervised Learning"),
      opt("c", "Reinforcement Learning"),
      opt("d", "Transfer Learning"),
    ],
    // "c"
    correctAnswer: "c",
    competencyId: "cmp-ai-training",
    difficulty: 0.3,
    timeLimitSec: 90,
    isValidated: true,
    rubric: [
      {
        criterion: "Answer",
        weight: 1,
        levels: [
          "C — Reinforcement Learning",
          "Reward and penalty driven; the same family that produced systems beating world champions at Chess and Go",
        ],
      },
    ],
  },
];

async function main() {
  console.log("Seeding the AI fundamentals quiz...");

  await db.insert(competencies).values(COMPETENCIES).onConflictDoNothing();

  await db.insert(questions).values(QUESTION_BANK).onConflictDoNothing();
  console.log(`  questions: ${QUESTION_BANK.length}`);

  await db
    .insert(assessments)
    .values({
      id: "asmt-ai-fundamentals",
      title: "AI Fundamentals",
      description:
        "Five questions covering AI terminology, history, and how models are trained. Fully auto-graded — your score appears as soon as you submit.",
      status: "published",
      delivery: "untimed",
      durationMin: 15,
      passMark: 80,
      requireProctoring: false,
      blindReview: true,
    })
    .onConflictDoNothing();

  await db
    .insert(assessmentQuestions)
    .values(
      QUESTION_BANK.map((q, i) => ({
        assessmentId: "asmt-ai-fundamentals",
        questionId: q.id as string,
        position: i + 1,
        // Equal weights: five equally weighted facts, not a staged difficulty ramp.
        weight: 1,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(assessmentCompetencies)
    .values([
      { assessmentId: "asmt-ai-fundamentals", competencyId: "cmp-ai-foundations", weight: 1 },
      { assessmentId: "asmt-ai-fundamentals", competencyId: "cmp-ai-training", weight: 1 },
    ])
    .onConflictDoNothing();

  const candidates = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users);

  const candidateRows = candidates.filter((u) => u.role === "candidate");

  if (candidateRows.length === 0) {
    console.log("  no candidate accounts found — skipped invitations");
  } else {
    const existing = await db
      .select({ id: assessmentInvitations.id })
      .from(assessmentInvitations)
      .where(eq(assessmentInvitations.assessmentId, "asmt-ai-fundamentals"));

    const already = new Set(existing.map((i) => i.id));
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60_000);

    const toInsert = candidateRows
      .map((c) => ({
        // Derived from the user id so re-running cannot duplicate invitations.
        id: `inv-ai-${hashToken(c.id).slice(0, 12)}`,
        assessmentId: "asmt-ai-fundamentals",
        candidateId: c.id,
        token: newToken(),
        expiresAt: expiry,
        status: "invited" as const,
      }))
      .filter((i) => !already.has(i.id));

    if (toInsert.length > 0) await db.insert(assessmentInvitations).values(toInsert);
    console.log(
      `  invitations: ${toInsert.length} added, ${candidateRows.length} candidate(s) total`,
    );
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });