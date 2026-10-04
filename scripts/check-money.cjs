// Confirms the STK probe left no money moved: checks the service wallet balance
// and the most recent transactions.
const https = require("https");
require("dotenv").config({ path: ".env.local", quiet: true });

const AUTH = "Basic " + Buffer.from(
  `${process.env.PAYHERO_USERNAME}:${process.env.PAYHERO_PASSWORD}`,
).toString("base64");

function get(path) {
  return new Promise((resolve) => {
    const r = https.request(
      {
        host: "backend.payhero.co.ke",
        path: "/api/v2/" + path,
        method: "GET",
        headers: { Authorization: AUTH, Accept: "application/json" },
        timeout: 15000,
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(b));
          } catch {
            resolve({ raw: b.slice(0, 200) });
          }
        });
      },
    );
    r.on("timeout", () => {
      r.destroy();
      resolve({ error: "timeout" });
    });
    r.on("error", (e) => resolve({ error: e.code || e.message }));
    r.end();
  });
}

async function main() {
  const wallet = await get("wallets?wallet_type=service_wallet");
  console.log("SERVICE WALLET");
  console.log("  status :", wallet.wallet_status);
  console.log("  balance:", wallet.available_balance, wallet.currency);

  const list = await get("transactions?page=1&per_page=5");
  console.log("\nRECENT TRANSACTIONS");
  for (const t of list.transactions ?? []) {
    console.log(
      `  ${t.created_at}  ${t.transaction_type}  ${t.amount}  status=${t.status ?? "-"}  desc=${t.description ?? "-"}`,
    );
  }

  const charged = (list.transactions ?? []).filter(
    (t) => Number(t.amount) > 0 && t.status === "Success",
  );
  console.log(
    `\nSuccessful charges over 0 in this page: ${charged.length}` +
      (charged.length ? " — review the list above" : " (nothing taken)"),
  );
}

main();