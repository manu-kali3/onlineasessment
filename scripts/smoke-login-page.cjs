// Asserts the public login page exposes no demo credentials.
const B = process.env.BASE || "http://localhost:3153";

async function main() {
  const res = await fetch(`${B}/login`);
  const html = await res.text();
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const checks = [
    ["status is 200", res.status === 200],
    ["no @portal.test address", !/portal\.test/.test(html)],
    ["no published password", !/Passw0rd/.test(html)],
    ["no quick-fill panel", !/Quick fill/i.test(html)],
    ["email input not prefilled", !/id="email"[^>]*value="[^"]+"/.test(html)],
    ["password input not prefilled", !/id="password"[^>]*value="[^"]+"/.test(html)],
    ["forgot-password link present", /Forgot password/i.test(html)],
    ["register link present", /Create an account/i.test(html)],
  ];

  for (const [label, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  }

  const start = text.indexOf("Sign in");
  console.log("\npage text:", JSON.stringify(text.slice(start, start + 200)));
}

main().catch((e) => {
  console.log("ERR:", e.message);
  process.exit(1);
});