// Verifies the seeded web-dev assessment and its invitations.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function main() {
  const items = rows(
    await sql.query(
      `select aq.position, q.type, left(q.prompt, 60) as prompt, q.correct_answer
       from assessment_questions aq
       join questions q on q.id = aq.question_id
       where aq.assessment_id = 'asmt-web-fundamentals'
       order by aq.position`,
    ),
  );

  console.log(`Web Development Fundamentals — ${items.length} questions\n`);
  for (const i of items) {
    const graded = i.correct_answer === null ? "assessor" : "auto";
    console.log(
      `  ${String(i.position).padStart(2)}. ${String(i.type).padEnd(10)} [${graded}] ${i.prompt}`,
    );
  }

  const comps = rows(
    await sql.query(
      `select c.name from assessment_competencies ac
       join competencies c on c.id = ac.competency_id
       where ac.assessment_id = 'asmt-web-fundamentals' order by c.name`,
    ),
  );
  console.log(`\nCompetencies: ${comps.map((c) => c.name).join(", ")}`);

  const inv = rows(
    await sql.query(
      `select u.email, u.role from assessment_invitations ai
       join users u on u.id = ai.candidate_id
       where ai.assessment_id = 'asmt-web-fundamentals' order by u.email`,
    ),
  );
  console.log(`\nInvited (${inv.length}):`);
  for (const i of inv) console.log(`  ${i.email}  (${i.role})`);
}

main().catch((e) => console.log("ERR:", e.message));