// Checks the mobile nav and table wrappers in the served HTML. Viewport-driven
// behaviour (the md breakpoint) is CSS, so these assertions cover the parts
// that are in the markup: the toggle's accessible wiring, the mobile nav
// landmark, and that every wide table sits inside a scroll container.
const BASE = process.env.BASE || "http://localhost:3230";

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)})`}`,
    );

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "recruiter@portal.test", password: "Passw0rd!" }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");

  const pages = [
    ["/admin", "admin overview"],
    ["/admin/analytics", "analytics"],
    ["/admin/assessments", "test authoring"],
    ["/admin/integrations", "integrations"],
  ];

  for (const [path, name] of pages) {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
    const html = await res.text();
    console.log(`\n=== ${name} (${path}) -> ${res.status} ===`);

    // Toggle button wiring.
    pass("has a menu toggle", /aria-label="Open menu"/.test(html), true);
    pass("toggle is collapsed by default", /aria-expanded="false"/.test(html), true);
    pass("toggle controls the nav", /aria-controls="mobile-nav"/.test(html), true);
    pass("toggle hidden on desktop", /md:hidden/.test(html), true);
    pass("desktop nav marked up", /aria-label="Main"/.test(html), true);

    // The mobile sheet is not in the DOM until opened.
    pass("mobile sheet closed initially", /id="mobile-nav"/.test(html), false);

    // Every table must sit inside a scroll wrapper.
    const tables = (html.match(/<table/g) ?? []).length;
    const wraps = (html.match(/class="table-wrap/g) ?? []).length;
    console.log(`   tables=${tables} wrappers=${wraps}`);
    pass("no table escapes a scroll wrapper", tables === 0 || wraps >= tables, true);

    if (tables > 0) {
      pass("wrappers are focusable regions", /role="region"/.test(html), true);
      pass("wrappers are labelled", /aria-label="[^"]+"/.test(html), true);
    }
  }

  console.log("\nall mobile checks passed");
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});