// Verifies the seeded graphic-design assessment, and independently checks that
// the rgbToCmyk reference solution passes the seeded test cases — a wrong
// expected value would make the item impossible to score correctly.
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const rows = (r) => r.rows ?? r;

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)})`}`,
    );

  const qs = rows(
    await sql.query(
      `select aq.position, q.id, q.type, q.correct_answer,
              q.coding_spec->>'functionName' as fn
       from assessment_questions aq join questions q on q.id = aq.question_id
       where aq.assessment_id = 'asmt-graphic-design' order by aq.position`,
    ),
  );
  pass("six questions", qs.length, 6);
  console.log("");
  for (const q of qs) {
    const graded = q.correct_answer ? "auto" : "assessor";
    console.log(`   ${q.position}. ${q.id.padEnd(18)} ${String(q.type).padEnd(16)} [${graded}]`);
  }
  pass("exactly one coding item", qs.filter((q) => q.type === "coding").length, 1);
  pass(
    "no prose item carries an answer key",
    qs.filter((q) => q.type === "free_text" && q.correct_answer !== null).length,
    0,
  );

  const spec = rows(
    await sql.query("select coding_spec from questions where id = 'gd-rgb-cmyk'"),
  )[0].coding_spec;
  pass("coding spec present", Boolean(spec), true);
  pass("test cases present", spec?.testCases?.length, 3);

  // Reference implementation of the documented algorithm.
  function rgbToCmyk(r, g, b) {
    const R = r / 255, G = g / 255, B = b / 255;
    const k = 1 - Math.max(R, G, B);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 1 };
    return {
      c: (1 - R - k) / (1 - k),
      m: (1 - G - k) / (1 - k),
      y: (1 - B - k) / (1 - k),
      k,
    };
  }

  console.log("\nreference solution against the seeded expectations:");
  let allOk = true;
  for (const tc of spec.testCases) {
    const [r, g, b] = tc.input.split(",").map(Number);
    const out = rgbToCmyk(r, g, b);
    const actual = `c=${+out.c.toFixed(2)},m=${+out.m.toFixed(2)},y=${+out.y.toFixed(2)},k=${+out.k.toFixed(2)}`;
    const wantNums = tc.expected.match(/[\d.]+/g).map(Number);
    const gotNums = [+out.c.toFixed(2), +out.m.toFixed(2), +out.y.toFixed(2), +out.k.toFixed(2)];
    const ok = wantNums.every((n, i) => Math.abs(n - gotNums[i]) < 0.01);
    allOk = allOk && ok;
    console.log(`   ${ok ? "PASS" : "FAIL"}  rgb(${tc.input}) -> ${actual}`);
  }
  pass("every seeded expectation is achievable", allOk, true);

  const comps = rows(
    await sql.query(
      `select c.name from assessment_competencies ac join competencies c on c.id = ac.competency_id
       where ac.assessment_id = 'asmt-graphic-design' order by c.name`,
    ),
  );
  console.log(`\ncompetencies: ${comps.map((c) => c.name).join(", ")}`);

  const invs = rows(
    await sql.query(
      `select u.email from assessment_invitations ai join users u on u.id = ai.candidate_id
       where ai.assessment_id = 'asmt-graphic-design' order by u.email`,
    ),
  );
  console.log(`invited (${invs.length}): ${invs.map((i) => i.email).join(", ")}`);
}

main().catch((e) => console.log("ERR:", e.message));