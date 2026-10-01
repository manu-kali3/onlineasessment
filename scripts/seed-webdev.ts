/**
 * Seeds a "Web Development Fundamentals" assessment built from the supplied
 * question bank, and invites every candidate account to it.
 *
 * Separate from scripts/seed.ts because this is an add-on content pack rather
 * than the base demo data. Idempotent: safe to re-run.
 *
 * The question prose arrived with one interactive request — "use this
 * interactive model to see how adjusting padding, borders, and margins changes
 * an element's total footprint". That is expressed here as a coding item, since
 * the runner already renders a code editor, rather than as a static paragraph.
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
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
  { id: "cmp-web-html", name: "Web: HTML", description: "Markup structure and browser storage." },
  { id: "cmp-web-css", name: "Web: CSS", description: "Layout, the box model, and responsive design." },
  { id: "cmp-web-js", name: "Web: JavaScript", description: "Language semantics and asynchronous behaviour." },
  { id: "cmp-web-arch", name: "Web: Architecture", description: "HTTP semantics and browser security." },
];

type SeedQuestion = typeof questions.$inferInsert;

const QUESTION_BANK: SeedQuestion[] = [
  {
    id: "wd-semantic-html",
    type: "free_text",
    prompt:
      "What is semantic HTML, and why does it matter? Give a concrete example of a generic element and its semantic equivalent.",
    competencyId: "cmp-web-html",
    difficulty: 0.4,
    timeLimitSec: 300,
    isValidated: true,
    rubric: [
      {
        criterion: "Definition",
        weight: 0.35,
        levels: [
          "Markup that carries meaning, not just presentation",
          "Describes what the content is, not how it looks",
        ],
      },
      {
        criterion: "Examples",
        weight: 0.35,
        levels: [
          "Cites <article>, <header>, <nav>, <footer> against <div>/<span>",
          "Names at least two correct semantic tags",
        ],
      },
      {
        criterion: "Rationale",
        weight: 0.3,
        levels: [
          "Accessibility for screen readers",
          "SEO via clearer document structure",
          "Readability and maintainability",
        ],
      },
    ],
  },
  {
    id: "wd-storage",
    type: "free_text",
    prompt:
      "Contrast localStorage, sessionStorage, and cookies. For each, state how long data lives, the approximate size limit, and whether it is sent to the server automatically.",
    competencyId: "cmp-web-html",
    difficulty: 0.5,
    timeLimitSec: 420,
    isValidated: true,
    rubric: [
      {
        criterion: "Lifetime",
        weight: 0.35,
        levels: [
          "localStorage persists until cleared; sessionStorage dies with the tab",
          "Both are origin-scoped, cookies may carry an expiry",
        ],
      },
      {
        criterion: "Capacity",
        weight: 0.25,
        levels: ["Roughly 5MB for storage APIs, 4KB per cookie"],
      },
      {
        criterion: "Transmission",
        weight: 0.4,
        levels: [
          "Only cookies are attached to HTTP requests automatically",
          "Storage APIs require explicit read and fetch calls",
        ],
      },
    ],
  },
  {
    id: "wd-box-model",
    type: "coding",
    prompt:
      "Implement `totalWidth(box)`. Given `{ width, padding, border, margin }` return the horizontal space the element occupies including both padding and margin, so the effect of adjusting each layer is explicit. Then explain which layer is transparent and why.",
    competencyId: "cmp-web-css",
    difficulty: 0.5,
    timeLimitSec: 600,
    isValidated: true,
    codingSpec: {
      language: "javascript",
      starterCode:
        "function totalWidth(box) {\n  // box: { width, padding, border, margin }\n  // return width + padding + border + margin, times 2 for the\n  // left and right edges of each layer.\n}",
      functionName: "totalWidth",
      testCases: [
        { input: '{width:100,padding:10,border:2,margin:5}', expected: "134" },
        { input: '{width:200,padding:0,border:0,margin:0}', expected: "200" },
        { input: '{width:50,padding:20,border:5,margin:10}', expected: "140" },
      ],
    },
    rubric: [
      {
        criterion: "Correctness",
        weight: 0.5,
        levels: [
          "Accounts for both edges of every layer",
          "Handles zero values without special-casing",
        ],
      },
      {
        criterion: "Explanation",
        weight: 0.3,
        levels: [
          "Padding and margin are transparent; content, padding and border paint",
          "Border sits outside padding but inside margin",
        ],
      },
      {
        criterion: "Clarity",
        weight: 0.2,
        levels: ["Names each layer", "No dead code"],
      },
    ],
  },
  {
    id: "wd-flexbox-grid",
    type: "free_text",
    prompt:
      "When would you choose Flexbox over CSS Grid? Describe a concrete layout for each and explain what distinguishes them.",
    competencyId: "cmp-web-css",
    difficulty: 0.5,
    timeLimitSec: 420,
    isValidated: true,
    rubric: [
      {
        criterion: "Dimensionality",
        weight: 0.4,
        levels: [
          "Flexbox is one-dimensional (a row or a column)",
          "Grid is two-dimensional, controlling rows and columns together",
        ],
      },
      {
        criterion: "Use cases",
        weight: 0.4,
        levels: [
          "Flexbox for nav bars and single-axis distributions",
          "Grid for page skeletons and dashboards",
        ],
      },
      {
        criterion: "Nuance",
        weight: 0.2,
        levels: [
          "Overlap is possible; choice depends on the two-dimensional need",
          "Notes that Grid can substitute for most Flexbox work",
        ],
      },
    ],
  },
  {
    id: "wd-var-let-const",
    type: "free_text",
    prompt:
      "Explain the differences in scope and reassignment between var, let, and const. Include what hoisting does to each, and whether the contents of a const object can be modified.",
    competencyId: "cmp-web-js",
    difficulty: 0.45,
    timeLimitSec: 420,
    isValidated: true,
    rubric: [
      {
        criterion: "Scope",
        weight: 0.35,
        levels: [
          "var is function-scoped; let and const are block-scoped",
          "let and const cannot be redeclared in the same block",
        ],
      },
      {
        criterion: "Hoisting",
        weight: 0.3,
        levels: [
          "var is hoisted and initialised to undefined",
          "let and const are hoisted but stay in the temporal dead zone",
        ],
      },
      {
        criterion: "Mutability",
        weight: 0.35,
        levels: [
          "const prevents rebinding, not mutation of object contents",
          "Properties and array elements of a const can still change",
        ],
      },
    ],
  },
  {
    id: "wd-equality",
    type: "free_text",
    prompt:
      "What is the difference between == and ===? Give a concrete example where they disagree, and say which you should use by default.",
    competencyId: "cmp-web-js",
    difficulty: 0.35,
    timeLimitSec: 300,
    isValidated: true,
    rubric: [
      {
        criterion: "Coercion",
        weight: 0.4,
        levels: [
          "== coerces types before comparing",
          "=== compares both value and type",
        ],
      },
      {
        criterion: "Example",
        weight: 0.3,
        levels: ['5 == "5" is true while 5 === "5" is false'],
      },
      {
        criterion: "Guidance",
        weight: 0.3,
        levels: [
          "Default to ===",
          "Mentions the null check exception: x == null",
        ],
      },
    ],
  },
  {
    id: "wd-promise",
    type: "free_text",
    prompt:
      "Describe what a Promise is, name its three states, and explain how it replaces nested callbacks. Include how an error propagates through a chain.",
    competencyId: "cmp-web-js",
    difficulty: 0.5,
    timeLimitSec: 420,
    isValidated: true,
    rubric: [
      {
        criterion: "Definition",
        weight: 0.3,
        levels: [
          "A value representing eventual completion of an async operation",
          "Not necessarily an I/O operation",
        ],
      },
      {
        criterion: "States",
        weight: 0.35,
        levels: [
          "Pending, fulfilled, rejected — all three named and described",
          "States are immutable once settled",
        ],
      },
      {
        criterion: "Chaining and errors",
        weight: 0.35,
        levels: [
          ".then returns a new promise enabling chaining",
          "A rejection skips to .catch or the next rejection handler",
        ],
      },
    ],
  },
  {
    id: "wd-get-post",
    type: "free_text",
    prompt:
      "How do HTTP GET and POST differ? Cover where parameters travel, what is cacheable, and which you must not use for credentials.",
    competencyId: "cmp-web-arch",
    difficulty: 0.45,
    timeLimitSec: 360,
    isValidated: true,
    rubric: [
      {
        criterion: "Parameter location",
        weight: 0.3,
        levels: ["GET appends to the query string; POST sends a body"],
      },
      {
        criterion: "Caching and history",
        weight: 0.3,
        levels: [
          "GET is cacheable and remains in history",
          "POST is not cached by default",
        ],
      },
      {
        criterion: "Safety",
        weight: 0.4,
        levels: [
          "GET must not carry passwords or secrets — it is logged and cached",
          "POST is the correct method for creating or updating",
        ],
      },
    ],
  },
  {
    id: "wd-cors",
    type: "free_text",
    prompt:
      "What problem does CORS solve? Explain the same-origin policy, and what a server must send for a browser to permit a cross-origin request.",
    competencyId: "cmp-web-arch",
    difficulty: 0.55,
    timeLimitSec: 420,
    isValidated: true,
    rubric: [
      {
        criterion: "Same-origin policy",
        weight: 0.3,
        levels: [
          "Browsers block cross-origin reads by default",
          "Compares scheme, host and port",
        ],
      },
      {
        criterion: "Mechanism",
        weight: 0.4,
        levels: [
          "Server opts in with Access-Control-Allow-Origin and related headers",
          "It is a browser control, not an access control",
        ],
      },
      {
        criterion: "Preflight",
        weight: 0.3,
        levels: [
          "Non-simple requests trigger an OPTIONS preflight",
          "Credentials require an explicit allow-credentials header",
        ],
      },
    ],
  },
];

/** The neon-http driver resolves to a plain array; there is no `.rows`. */
const rows = <T,>(r: T[]): T[] => r;

async function main() {
  console.log("Seeding the web development assessment...");

  await db
    .insert(competencies)
    .values(COMPETENCIES)
    .onConflictDoNothing();

  await db.insert(questions).values(QUESTION_BANK).onConflictDoNothing();
  console.log(`  questions: ${QUESTION_BANK.length}`);

  await db
    .insert(assessments)
    .values({
      id: "asmt-web-fundamentals",
      title: "Web Development Fundamentals",
      description:
        "HTML, CSS, JavaScript and web architecture fundamentals. Untimed practice; written responses are reviewed by an assessor.",
      status: "published",
      delivery: "untimed",
      durationMin: 45,
      passMark: 60,
      requireProctoring: false,
      blindReview: true,
    })
    .onConflictDoNothing();

  await db
    .insert(assessmentQuestions)
    .values(
      QUESTION_BANK.map((q, i) => ({
        assessmentId: "asmt-web-fundamentals",
        questionId: q.id as string,
        position: i + 1,
        weight: 1,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(assessmentCompetencies)
    .values([
      { assessmentId: "asmt-web-fundamentals", competencyId: "cmp-web-html", weight: 1 },
      { assessmentId: "asmt-web-fundamentals", competencyId: "cmp-web-css", weight: 1 },
      { assessmentId: "asmt-web-fundamentals", competencyId: "cmp-web-js", weight: 1 },
      { assessmentId: "asmt-web-fundamentals", competencyId: "cmp-web-arch", weight: 1 },
    ])
    .onConflictDoNothing();

  // Invite every candidate. Staff accounts have no candidate dashboard, so an
  // invitation would not surface for them.
  const candidates = rows(
    await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users),
  ).filter((u) => u.role === "candidate");

  if (candidates.length === 0) {
    console.log("  no candidate accounts found — skipped invitations");
  } else {
    const existing = rows(
      await db
        .select({ id: assessmentInvitations.id })
        .from(assessmentInvitations)
        .where(eq(assessmentInvitations.assessmentId, "asmt-web-fundamentals")),
    );

    const already = new Set(existing.map((i) => i.id));
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60_000);

    const toInsert = candidates
      .map((c) => ({
        id: `inv-web-${hashToken(c.id).slice(0, 12)}`,
        assessmentId: "asmt-web-fundamentals",
        candidateId: c.id,
        token: newToken(),
        expiresAt: expiry,
        status: "invited" as const,
      }))
      .filter((i) => !already.has(i.id));

    if (toInsert.length > 0) {
      await db.insert(assessmentInvitations).values(toInsert);
    }
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