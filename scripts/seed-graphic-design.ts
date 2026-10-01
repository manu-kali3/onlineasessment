/**
 * Seeds a "Graphic Design Fundamentals" assessment: six written items covering
 * design principles, typography, colour models, and image formats.
 *
 * Five are prose questions scored by rubric. The sixth — the supplied material
 * asked for an interactive colour mixer demonstrating additive vs subtractive
 * mixing — is expressed as a coding item, `rgbToCmyk`, because the runner
 * already renders a code editor and can then grade the result automatically
 * rather than leaving it for an assessor.
 *
 * Idempotent: safe to re-run, and re-running picks up new candidates.
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
    id: "cmp-gd-principles",
    name: "Design Principles",
    description: "Composition, hierarchy, and layout theory.",
  },
  {
    id: "cmp-gd-type",
    name: "Typography",
    description: "Type classification and the three spacing controls.",
  },
  {
    id: "cmp-gd-color",
    name: "Colour and Formats",
    description: "Additive and subtractive colour, raster and vector output.",
  },
];

type SeedQuestion = typeof questions.$inferInsert;

const QUESTION_BANK: SeedQuestion[] = [
  {
    id: "gd-principles",
    type: "free_text",
    prompt:
      "Name the fundamental principles of design and explain what each one controls in a composition.",
    competencyId: "cmp-gd-principles",
    difficulty: 0.45,
    timeLimitSec: 600,
    isValidated: true,
    rubric: [
      {
        criterion: "Coverage",
        weight: 0.5,
        levels: [
          "Covers balance, contrast, emphasis or hierarchy, proportion or scale, repetition or rhythm, and white space",
          "Four or more of the six named",
        ],
      },
      {
        criterion: "Explanation",
        weight: 0.35,
        levels: [
          "Describes what each principle does rather than listing names",
          "Notes symmetry vs asymmetry, or hierarchy as what reads first",
        ],
      },
      {
        criterion: "Terminology",
        weight: 0.15,
        levels: [
          "Uses negative space for white space",
          "Distinguishes rhythm from repetition",
        ],
      },
    ],
  },
  {
    id: "gd-rule-of-thirds",
    type: "free_text",
    prompt:
      'What is the "rule of thirds"? Explain how the grid is constructed and where key elements should sit.',
    competencyId: "cmp-gd-principles",
    difficulty: 0.35,
    timeLimitSec: 360,
    isValidated: true,
    rubric: [
      {
        criterion: "Construction",
        weight: 0.45,
        levels: [
          "Two equally spaced horizontal and two vertical lines forming a 3x3 grid",
          "Divides the frame into nine equal parts",
        ],
      },
      {
        criterion: "Placement",
        weight: 0.4,
        levels: [
          "Key elements on the lines or at their intersections",
          "Explicitly not centring the subject",
        ],
      },
      {
        criterion: "Purpose",
        weight: 0.15,
        levels: ["Creates tension, energy, or interest"],
      },
    ],
  },
  {
    id: "gd-serif-sans",
    type: "free_text",
    prompt:
      "What is the difference between serif and sans-serif typefaces? Give an example of each and describe how each is perceived.",
    competencyId: "cmp-gd-type",
    difficulty: 0.3,
    timeLimitSec: 300,
    isValidated: true,
    rubric: [
      {
        criterion: "Anatomy",
        weight: 0.4,
        levels: [
          "Serif has small finishing strokes or feet at letter edges; sans-serif does not",
        ],
      },
      {
        criterion: "Examples",
        weight: 0.25,
        levels: [
          "Serif: Times New Roman or Garamond",
          "Sans-serif: Helvetica or Arial",
        ],
      },
      {
        criterion: "Perception",
        weight: 0.35,
        levels: [
          "Serif reads as traditional, formal, authoritative",
          "Sans-serif reads as modern, minimal, legible on screens",
        ],
      },
    ],
  },
  {
    id: "gd-spacing",
    type: "free_text",
    prompt:
      "Distinguish between leading, tracking, and kerning. State which axis each control affects.",
    competencyId: "cmp-gd-type",
    difficulty: 0.4,
    timeLimitSec: 360,
    isValidated: true,
    rubric: [
      {
        criterion: "Leading",
        weight: 0.3,
        levels: ["Vertical space between lines of text, also called line height"],
      },
      {
        criterion: "Tracking",
        weight: 0.3,
        levels: [
          "Uniform horizontal space between all letters in a block",
          "Applies across a whole run of text",
        ],
      },
      {
        criterion: "Kerning",
        weight: 0.4,
        levels: [
          "Horizontal space between two specific individual characters",
          "Applied pairwise to fix an awkward gap",
        ],
      },
    ],
  },
  {
    id: "gd-rgb-cmyk",
    type: "coding",
    prompt:
      "Implement `rgbToCmyk(r, g, b)`. Given 8-bit RGB channels (0-255) return `{ c, m, y, k }` as values between 0 and 1, using the standard subtractive conversion. Pure white should return zero chroma with k = 0, and pure black should return k = 1 with no chroma.",
    competencyId: "cmp-gd-color",
    difficulty: 0.55,
    timeLimitSec: 900,
    isValidated: true,
    codingSpec: {
      language: "javascript",
      starterCode:
        "function rgbToCmyk(r, g, b) {\n  // Normalise the channels to 0..1.\n  // k = 1 - max(r, g, b)\n  // When k === 1 the colour is black: no chroma at all.\n  // Otherwise divide out the black before scaling each channel.\n}",
      functionName: "rgbToCmyk",
      testCases: [
        { input: "255,255,255", expected: "c=0,m=0,y=0,k=0" },
        { input: "0,0,0", expected: "c=0,m=0,y=0,k=1" },
        { input: "255,0,0", expected: "c=0,m=1,y=1,k=0" },
      ],
    },
    rubric: [
      {
        criterion: "Normalisation",
        weight: 0.2,
        levels: ["Divides each 8-bit channel by 255"],
      },
      {
        criterion: "Black generation",
        weight: 0.3,
        levels: [
          "k is 1 minus the largest normalised channel",
          "Pure black is handled without dividing by zero",
        ],
      },
      {
        criterion: "Chroma",
        weight: 0.35,
        levels: [
          "Scales each remaining channel by 1 - k",
          "Returns c, m and y in the conventional order",
        ],
      },
      {
        criterion: "Clarity",
        weight: 0.15,
        levels: ["Names each step", "No dead code"],
      },
    ],
  },
  {
    id: "gd-raster-vector",
    type: "free_text",
    prompt:
      "What is the difference between raster and vector graphics? Explain how each scales, and give a format and a suitable use for each.",
    competencyId: "cmp-gd-color",
    difficulty: 0.4,
    timeLimitSec: 420,
    isValidated: true,
    rubric: [
      {
        criterion: "Raster",
        weight: 0.35,
        levels: [
          "A fixed grid of pixels",
          "Pixelates when scaled up; suits photographs",
          "Names JPEG, PNG, GIF or PSD",
        ],
      },
      {
        criterion: "Vector",
        weight: 0.4,
        levels: [
          "Mathematical paths, curves and shapes",
          "Scales to any size without loss",
          "Suits logos, icons, typography",
          "Names SVG, EPS or AI",
        ],
      },
      {
        criterion: "Contrast",
        weight: 0.25,
        levels: ["States the scaling behaviour is the practical difference"],
      },
    ],
  },
];

async function main() {
  console.log("Seeding the graphic design assessment...");

  await db.insert(competencies).values(COMPETENCIES).onConflictDoNothing();
  await db.insert(questions).values(QUESTION_BANK).onConflictDoNothing();
  console.log(`  questions: ${QUESTION_BANK.length}`);

  await db
    .insert(assessments)
    .values({
      id: "asmt-graphic-design",
      title: "Graphic Design Fundamentals",
      description:
        "Design principles, typography, colour models and image formats. Written items are reviewed by an assessor; the colour conversion item is auto-graded.",
      status: "published",
      delivery: "untimed",
      durationMin: 40,
      passMark: 60,
      requireProctoring: false,
      blindReview: true,
    })
    .onConflictDoNothing();

  await db
    .insert(assessmentQuestions)
    .values(
      QUESTION_BANK.map((q, i) => ({
        assessmentId: "asmt-graphic-design",
        questionId: q.id as string,
        position: i + 1,
        weight: 1,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(assessmentCompetencies)
    .values([
      { assessmentId: "asmt-graphic-design", competencyId: "cmp-gd-principles", weight: 1 },
      { assessmentId: "asmt-graphic-design", competencyId: "cmp-gd-type", weight: 1 },
      { assessmentId: "asmt-graphic-design", competencyId: "cmp-gd-color", weight: 1 },
    ])
    .onConflictDoNothing();

  const all = await db
    .select({ id: users.id, role: users.role })
    .from(users);
  const candidates = all.filter((u) => u.role === "candidate");

  if (candidates.length === 0) {
    console.log("  no candidate accounts found — skipped invitations");
  } else {
    const existing = await db
      .select({ id: assessmentInvitations.id })
      .from(assessmentInvitations)
      .where(eq(assessmentInvitations.assessmentId, "asmt-graphic-design"));
    const already = new Set(existing.map((i) => i.id));
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60_000);

    const toInsert = candidates
      .map((c) => ({
        id: `inv-gd-${hashToken(c.id).slice(0, 12)}`,
        assessmentId: "asmt-graphic-design",
        candidateId: c.id,
        token: newToken(),
        expiresAt: expiry,
        status: "invited" as const,
      }))
      .filter((i) => !already.has(i.id));

    if (toInsert.length > 0) await db.insert(assessmentInvitations).values(toInsert);
    console.log(
      `  invitations: ${toInsert.length} added, ${candidates.length} candidate(s) total`,
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