// Removes questions that smoke tests appended to seeded courses.
//
// The admin question API has no dedup, which is correct — an author genuinely
// wants to add the same prompt twice — so test runs leave debris behind that has
// to be swept rather than prevented.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
const rows = (r) => r.rows ?? r;

// Prompts written by scripts/smoke-courses.cjs, which creates a question each run.
const TEST_PROMPTS = [
  "Which data structure uses FIFO ordering?",
];

async function main() {
  const dry = process.argv.includes("--dry");

  const found = rows(
    await sql.query(
      "select id, prompt from questions where prompt = any($1::text[])",
      [TEST_PROMPTS],
    ),
  );

  if (found.length === 0) {
    console.log("No test questions to remove.");
    return;
  }

  for (const q of found) {
    console.log(`${dry ? "would remove" : "removed"}: ${q.prompt} (${q.id})`);
  }

  if (dry) return;

  // Unlink first: assessmentQuestions has no cascade configured in every branch.
  await sql.query("delete from assessment_questions where question_id = any($1::text[])", [
    found.map((q) => q.id),
  ]);
  await sql.query("delete from questions where id = any($1::text[])", [
    found.map((q) => q.id),
  ]);

  // Report the resulting question counts per course.
  const counts = rows(
    await sql.query(
      `select a.id, a.title, count(aq.question_id)::int as n
         from assessments a
         left join assessment_questions aq on aq.assessment_id = a.id
        group by a.id, a.title
        order by a.title`,
    ),
  );
  console.log("\nquestion counts now:");
  for (const c of counts) console.log(`  ${c.n}  ${c.title}`);
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});