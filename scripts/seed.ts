import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/db";
import {
  assessments,
  assessmentCompetencies,
  assessmentInvitations,
  assessmentQuestions,
  attempts,
  competencies,
  integrations,
  questions,
  users,
} from "../src/db/schema";

const hash = bcrypt.hashSync("Passw0rd!", 12);

async function main() {
  console.log("Seeding...");

  await db
    .insert(competencies)
    .values([
      { id: "cmp-digitacy", name: "Digital Literacy", description: "Comfort with digital tooling and interfaces." },
      { id: "cmp-problem", name: "Problem Solving", description: "Reasoning, structure, and analytical rigour." },
      { id: "cmp-comms", name: "Communication", description: "Clarity, tone, and audience awareness." },
      { id: "cmp-collab", name: "Collaboration", description: "Team orientation and conflict handling." },
    ])
    .onConflictDoNothing();

  const seedQuestions = [
    {
      id: "q-mc-1",
      type: "multiple_choice" as const,
      prompt: "You receive a spreadsheet with 40,000 rows and 3 duplicated customer IDs. What is your first move?",
      options: [
        { id: "a", label: "Delete the duplicates immediately" },
        { id: "b", label: "Inspect why the duplicates exist before changing anything" },
        { id: "c", label: "Rebuild the sheet from scratch" },
        { id: "d", label: "Ask a colleague to handle it" },
      ],
      correctAnswer: "b",
      competencyId: "cmp-problem",
      difficulty: 0.6,
      timeLimitSec: 90,
      isValidated: true,
    },
    {
      id: "q-ms-1",
      type: "multi_select" as const,
      prompt: "Which of these reduce risk when handling personal data? Select all that apply.",
      options: [
        { id: "a", label: "Collect only the fields you need" },
        { id: "b", label: "Store an encrypted copy of the raw export" },
        { id: "c", label: "Set a retention period and delete on schedule" },
        { id: "d", label: "Share the full dataset with the wider team" },
      ],
      correctAnswer: ["a", "c"],
      competencyId: "cmp-digitacy",
      difficulty: 0.5,
      isValidated: true,
    },
    {
      id: "q-tf-1",
      type: "true_false" as const,
      prompt: "A password manager is less secure than reusing one strong password everywhere.",
      options: [],
      correctAnswer: false,
      competencyId: "cmp-digitacy",
      difficulty: 0.3,
      isValidated: true,
    },
    {
      id: "q-code-1",
      type: "coding" as const,
      prompt: "Write a function `median(nums)` that returns the median value of a non-empty array of numbers.",
      options: [],
      rubric: [
        { criterion: "Correctness", weight: 0.6, levels: ["Handles even/odd lengths", "Handles negative and float values"] },
        { criterion: "Clarity", weight: 0.2, levels: ["Readable naming", "No dead code"] },
        { criterion: "Complexity", weight: 0.2, levels: ["O(n log n) or better"] },
      ],
      codingSpec: {
        language: "javascript",
        starterCode: "function median(nums) {\n  // your code\n}",
        functionName: "median",
        testCases: [
          { input: "[1,3,2]", expected: "2" },
          { input: "[4,1,2,3]", expected: "2.5" },
          { input: "[-5,-1]", expected: "-3" },
        ],
      },
      competencyId: "cmp-problem",
      difficulty: 0.75,
      timeLimitSec: 900,
      isValidated: true,
    },
    {
      id: "q-sji-1",
      type: "video" as const,
      prompt: "A colleague you depend on missed a deadline that affects your client. Record how you raise it.",
      options: [],
      rubric: [
        { criterion: "Assertiveness", weight: 0.35, levels: ["States the impact plainly", "Avoids blame language"] },
        { criterion: "Empathy", weight: 0.3, levels: ["Acknowledges their constraints", "Offers support"] },
        { criterion: "Specificity", weight: 0.35, levels: ["Proposes a concrete next step and date"] },
      ],
      competencyId: "cmp-comms",
      difficulty: 0.7,
      timeLimitSec: 600,
      isValidated: true,
    },
    {
      id: "q-text-1",
      type: "free_text" as const,
      prompt: "In 150 words or fewer, describe a time you disagreed with a decision. What did you do, and what happened?",
      options: [],
      rubric: [
        { criterion: "Situation clarity", weight: 0.3, levels: ["Concise context"] },
        { criterion: "Own contribution", weight: 0.4, levels: ["Specific actions taken"] },
        { criterion: "Outcome and learning", weight: 0.3, levels: ["Honest reflection"] },
      ],
      competencyId: "cmp-collab",
      difficulty: 0.6,
      timeLimitSec: 900,
      isValidated: true,
    },
  ];

  await db.insert(questions).values(seedQuestions).onConflictDoNothing();
  console.log(`  questions: ${seedQuestions.length}`);

  await db
    .insert(assessments)
    .values([
      {
        id: "asmt-core-b",
        title: "Core Aptitude Battery",
        description: "Reasoning, digital fluency, and written communication.",
        status: "published",
        durationMin: 45,
        normGroup: "graduate-2026",
        passMark: 60,
        requireProctoring: true,
        blindReview: true,
      },
      {
        id: "asmt-sji-lead",
        title: "Leadership & Situational Judgment",
        description: "Video scenarios plus a written reflection.",
        status: "published",
        durationMin: 30,
        passMark: 65,
        requireProctoring: true,
        blindReview: true,
      },
      {
        id: "asmt-dev-screen",
        title: "Engineer Screening (WIP)",
        description: "Coding-heavy loop for technical roles.",
        status: "draft",
        durationMin: 90,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(assessmentQuestions)
    .values([
      { assessmentId: "asmt-core-b", questionId: "q-mc-1", position: 1, weight: 1 },
      { assessmentId: "asmt-core-b", questionId: "q-ms-1", position: 2, weight: 1 },
      { assessmentId: "asmt-core-b", questionId: "q-tf-1", position: 3, weight: 0.5 },
      { assessmentId: "asmt-core-b", questionId: "q-text-1", position: 4, weight: 2 },
      { assessmentId: "asmt-sji-lead", questionId: "q-sji-1", position: 1, weight: 1.5 },
    ])
    .onConflictDoNothing();

  await db
    .insert(assessmentCompetencies)
    .values([
      { assessmentId: "asmt-core-b", competencyId: "cmp-problem", weight: 1 },
      { assessmentId: "asmt-core-b", competencyId: "cmp-digitacy", weight: 1 },
      { assessmentId: "asmt-core-b", competencyId: "cmp-collab", weight: 1 },
    ])
    .onConflictDoNothing();

  await db
    .insert(users)
    .values([
      {
        id: "usr-admin",
        email: "admin@portal.test",
        passwordHash: hash,
        fullName: "Ada Admin",
        role: "admin",
      },
      {
        id: "usr-recruiter",
        email: "recruiter@portal.test",
        passwordHash: hash,
        fullName: "Rowan Recruiter",
        role: "recruiter",
      },
      {
        id: "usr-assessor",
        email: "assessor@portal.test",
        passwordHash: hash,
        fullName: "Sam Assessor",
        role: "assessor",
      },
      {
        id: "usr-cand-1",
        email: "candidate@portal.test",
        passwordHash: hash,
        fullName: "Casey Candidate",
        role: "candidate",
        accessibilityProfile: { textToSpeech: true, timeExtensionPct: 25 },
      },
      {
        id: "usr-cand-2",
        email: "jordan@portal.test",
        passwordHash: hash,
        fullName: "Jordan Lee",
        role: "candidate",
      },
      {
        id: "usr-cand-3",
        email: "priya@portal.test",
        passwordHash: hash,
        fullName: "Priya Nair",
        role: "candidate",
      },
    ])
    .onConflictDoNothing();

  // Invitations drive the candidate dashboard; attempts hang off them.
  //
  // Tokens are deterministic so re-running the seed is a no-op. The unique
  // index is on `token`, so random tokens would append duplicate invitations
  // on every run instead of skipping.
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60_000);

  await db
    .insert(assessmentInvitations)
    .values([
      {
        id: "inv-1",
        assessmentId: "asmt-core-b",
        candidateId: "usr-cand-1",
        token: "seed-token-inv-1",
        expiresAt: in7Days,
        status: "invited",
      },
      {
        id: "inv-2",
        assessmentId: "asmt-core-b",
        candidateId: "usr-cand-2",
        token: "seed-token-inv-2",
        expiresAt: in7Days,
        status: "in_progress",
      },
      {
        id: "inv-3",
        assessmentId: "asmt-core-b",
        candidateId: "usr-cand-3",
        token: "seed-token-inv-3",
        expiresAt: in7Days,
        status: "submitted",
      },
      {
        id: "inv-4",
        assessmentId: "asmt-sji-lead",
        candidateId: "usr-cand-1",
        token: "seed-token-inv-4",
        expiresAt: in7Days,
        status: "invited",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(attempts)
    .values([
      {
        id: "att-1",
        invitationId: "inv-1",
        assessmentId: "asmt-core-b",
        candidateId: "usr-cand-1",
        status: "invited",
      },
      {
        id: "att-2",
        invitationId: "inv-2",
        assessmentId: "asmt-core-b",
        candidateId: "usr-cand-2",
        status: "in_progress",
        startedAt: new Date(Date.now() - 8 * 60_000),
      },
      {
        id: "att-3",
        invitationId: "inv-3",
        assessmentId: "asmt-core-b",
        candidateId: "usr-cand-3",
        status: "submitted",
        startedAt: new Date(Date.now() - 52 * 60_000),
        submittedAt: new Date(Date.now() - 14 * 60_000),
        score: 74.5,
        percentile: 68.4,
        passed: true,
        competencyScores: { "cmp-problem": 80, "cmp-digitacy": 66, "cmp-collab": 77 },
        integrityScore: 100,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(integrations)
    .values([
      {
        id: "int-greenhouse",
        provider: "greenhouse",
        name: "Greenhouse — Engineering",
        baseUrl: "https://harvest.greenhouse.io/v1",
        active: true,
        fieldMapping: { score: "score", percentile: "percentile" },
      },
      {
        id: "int-workday",
        provider: "workday",
        name: "Workday — Corporate",
        baseUrl: "https://wd2-impl-services1.wd2.sys.wdworkday.com/ccx/api",
        active: false,
      },
    ])
    .onConflictDoNothing();

  console.log("Done.");
  console.log("Logins (password: Passw0rd!):");
  console.log("  admin@portal.test      admin");
  console.log("  recruiter@portal.test  recruiter");
  console.log("  assessor@portal.test   assessor");
  console.log("  candidate@portal.test  candidate");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });