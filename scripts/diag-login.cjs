// Diagnostic: why does the admin account fail to sign in?
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
const rows = (r) => r.rows ?? r;

/** Reads all of stdin, so a password can be piped in rather than passed as argv. */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const email = process.argv[2] || "manu161@brevansoftwares.co.ke";
  const pwFromStdin = process.argv[3] ? null : await readStdin();
  const res = await sql.query(
    "select * from users where email = $1",
    [email],
  );
  const u = rows(res)[0];

  if (!u) {
    console.log("No such user:", email);
    return;
  }

  for (const k of Object.keys(u).sort()) {
    if (k === "password_hash") continue;
    console.log(`  ${k}:`, u[k]);
  }
  console.log("  hash prefix:", String(u.password_hash).slice(0, 10));

  const pw = process.argv[3] ?? pwFromStdin;
  if (pw) {
    console.log("bcrypt compare:", bcrypt.compareSync(pw, u.password_hash));
  } else {
    console.log("(pipe a password on stdin to test it against the stored hash)");
  }
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});