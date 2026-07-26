// Fills api_usage with fake call history so the dashboard has something real
// to render. Stands in for the API gateway a real product would have writing
// a row on every call.
//
//   npm run seed:usage           -- refuses to run if api_usage already has rows
//   npm run seed:usage -- --reset -- wipes api_usage first, then reseeds

import { createDb } from '../database/db.js';

// how full each API's quota ends up, picked at random per API so the dashboard
// shows a mix of healthy, warning (>=80%) and maxed-out bars
const FILL_LEVELS = [0.05, 0.18, 0.4, 0.62, 0.85, 0.97, 1];

const pick = (items) => items[Math.floor(Math.random() * items.length)];

const randomDateBetween = (start, end) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

// every (user, api product) pair a currently-subscribed user is entitled to.
// period_start comes from a correlated subquery rather than a join to
// payment_history: a subscription can have several payments, and joining would
// multiply every product row by the number of payments
const findSeedTargets = (sql) => sql`
  SELECT s.user_id,
         l.api_product_id,
         l.monthly_limit::int AS monthly_limit,
         (SELECT MAX(ph.period_start)
            FROM payment_history ph
           WHERE ph.subscription_id = s.subscription_id) AS period_start
  FROM subscriptions s
  JOIN plan_api_limits l ON l.plan_id = s.plan_id
  WHERE s.ended_at IS NULL`;

const buildRows = (target, now) => {
  const start = target.period_start ? new Date(target.period_start) : now;

  // a period that hasn't started yet would make the range negative
  const windowStart = start > now ? now : start;

  const count = Math.round(target.monthly_limit * pick(FILL_LEVELS));
  const rows = [];

  for (let i = 0; i < count; i++) {
    rows.push({
      user_id: target.user_id,
      api_product_id: target.api_product_id,
      used_at: randomDateBetween(windowStart, now),
    });
  }

  return rows;
};

const seed = async (sql, reset) => {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM api_usage`;

  if (count > 0 && !reset) {
    console.log(`api_usage already has ${count} rows. Re-run with --reset to wipe and reseed.`);
    return;
  }

  if (reset && count > 0) {
    await sql`DELETE FROM api_usage`;
    console.log(`Deleted ${count} existing rows.`);
  }

  const targets = await findSeedTargets(sql);

  if (targets.length === 0) {
    console.log('No active subscriptions with API limits -- nothing to seed.');
    return;
  }

  const now = new Date();
  let inserted = 0;

  for (const target of targets) {
    const rows = buildRows(target, now);
    if (rows.length === 0) continue;

    // postgres.js expands an array of objects into one multi-row INSERT
    await sql`INSERT INTO api_usage ${sql(rows, 'user_id', 'api_product_id', 'used_at')}`;
    inserted += rows.length;
  }

  console.log(`Inserted ${inserted} api_usage rows across ${targets.length} user/API pairs.`);
};

const sql = createDb();

try {
  await seed(sql, process.argv.includes('--reset'));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
