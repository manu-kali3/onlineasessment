// Shared helper for the smoke scripts: makes Neon queries retry.
//
// This machine's route to Neon drops connections intermittently, which surfaces as
// a thrown `fetch failed`. Without a retry that gets reported as a product failure
// when nothing is actually wrong.
//
// This patches `.query` in place rather than returning a new function, so existing
// call sites keep working unchanged.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps a Neon client's `query` with retries, mutating and returning the client.
 *
 * Note the Neon HTTP driver resolves to a plain array, not an object with `.rows`.
 * Call sites must handle both, or they will silently match nothing.
 */
function withRetry(sql, tries = 6) {
  const raw = sql.query.bind(sql);

  sql.query = async (text, params) => {
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        return await raw(text, params);
      } catch (e) {
        last = e;
        await sleep(600 * (i + 1));
      }
    }
    throw last;
  };

  return sql;
}

module.exports = { withRetry, sleep };