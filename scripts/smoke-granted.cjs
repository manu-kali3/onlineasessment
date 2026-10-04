// Confirms that granted accounts pass the paywall and that an unpaid account
// is still locked out.
//
// Passwords come from the environment, never from source: this repository is
// public-facing code and a hardcoded credential here would end up in git.
// Set GRANT_ADMIN_PASSWORD to run the operator case.
const BASE = process.env.BASE || "http://localhost:3250";

const CASES = [
  {
    email: "manu161@brevansoftwares.co.ke",
    password: process.env.GRANT_ADMIN_PASSWORD,
    path: "/admin",
    expectPaid: true,
    label: "operator admin",
  },
  {
    email: "manukorir161@gmail.com",
    password: process.env.GRANT_CANDIDATE_PASSWORD,
    path: "/candidate",
    expectPaid: true,
    label: "candidate",
  },
  {
    email: "jordan@portal.test",
    password: "Passw0rd!",
    path: "/candidate",
    expectPaid: false,
    label: "unpaid control",
  },
];

async function main() {
  const pass = (l, a, e) =>
    console.log(
      `${a === e ? "PASS" : "FAIL"}  ${l}${a === e ? "" : ` (got ${JSON.stringify(a)})`}`,
    );

  for (const c of CASES) {
    if (!c.password) {
      console.log(`SKIP  ${c.email} — no password supplied via environment`);
      continue;
    }

    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: c.email, password: c.password }),
    });
    const cookie = (login.headers.getSetCookie?.() ?? [])
      .map((x) => x.split(";")[0])
      .join("; ");

    const status = await (
      await fetch(`${BASE}/api/payments/status`, { headers: { cookie } })
    ).json();

    const page = await fetch(`${BASE}${c.path}`, {
      headers: { cookie },
      redirect: "manual",
    });

    console.log(`\n${c.email}  (${c.label})`);
    pass("  sign in", login.status, 200);
    pass("  paid flag matches expectation", status.paid, c.expectPaid);
    if (c.expectPaid) {
      pass(`  ${c.path} renders`, page.status, 200);
    } else {
      pass(`  ${c.path} locked`, page.status, 307);
      pass("  redirected to", page.headers.get("location"), "/paywall");
    }
  }
}

main().catch((e) => {
  console.log("FATAL:", e.message);
  process.exit(1);
});