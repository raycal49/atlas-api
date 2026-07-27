// Seeds the reference catalog (plans, API products, per-plan limits) and then
// fills api_usage with fake call history so the dashboard has something real to
// render. The usage half stands in for the API gateway a real product would
// have writing a row on every call.
//
//   npm run seed:usage            -- catalog always; usage only if api_usage is empty
//   npm run seed:usage -- --reset -- catalog, then wipe api_usage and reseed it
//
// The catalog half is insert-or-update only and NEVER deletes: plans and
// api_products are referenced by subscriptions and api_usage, so removing them
// would break existing rows.
//
// Usage seeding only covers users who already have an active subscription, so
// the first run reports nothing to seed. Pick a plan in the UI, then re-run.

import { createDb } from '../database/db.js';

// ── catalog ────────────────────────────────────────────────────────────────

const API_PRODUCTS = [
  'Geocoding',
  'Reverse Geocoding',
  'Directions',
  'Static Maps',
  'Isochrone',
  'Distance Matrix',
];

const PLANS = [
  {
    plan_name: 'Free',
    price_per_month: 0,
    description: 'For side projects and evaluation. Geocoding and static maps, rate limited.',
    is_active: true,
  },
  {
    plan_name: 'Developer',
    price_per_month: 49,
    description: 'Routing, reverse geocoding and isochrones for apps in production.',
    is_active: true,
  },
  {
    plan_name: 'Business',
    price_per_month: 199,
    description: 'The full API surface with headroom for high-traffic applications.',
    is_active: true,
  },
  {
    // inactive on purpose: it should never appear in the plan picker, but a user
    // already subscribed to it still sees the name on their dashboard
    plan_name: 'Starter (Legacy)',
    price_per_month: 19,
    description: 'Retired tier. Existing subscribers keep their pricing.',
    is_active: false,
  },
];

// higher tiers unlock more APIs, not just bigger numbers -- that is what makes
// an upgrade prompt mean something.
//
// limits are deliberately modest: the usage seeder inserts roughly
// monthly_limit x fill rows per pair, so a realistic-looking 2,000,000 quota
// would mean a million inserts for a single user.
const PLAN_LIMITS = {
  'Free': {
    'Geocoding': 500,
    'Static Maps': 1_000,
  },
  'Developer': {
    'Geocoding': 5_000,
    'Reverse Geocoding': 5_000,
    'Directions': 2_500,
    'Static Maps': 10_000,
    'Isochrone': 1_000,
  },
  'Business': {
    'Geocoding': 25_000,
    'Reverse Geocoding': 25_000,
    'Directions': 15_000,
    'Static Maps': 50_000,
    'Isochrone': 5_000,
    'Distance Matrix': 5_000,
  },
  'Starter (Legacy)': {
    'Geocoding': 2_000,
    'Static Maps': 4_000,
  },
};

// ── usage ──────────────────────────────────────────────────────────────────

// how full each API's quota ends up, picked at random per API so the dashboard
// shows a mix of healthy, warning (>=80%) and maxed-out bars
const FILL_LEVELS = [0.05, 0.18, 0.4, 0.62, 0.85, 0.97, 1];

// postgres.js builds one INSERT per call; a single statement carrying tens of
// thousands of rows is slow and can exceed parameter limits, so insert in batches
const CHUNK_SIZE = 1_000;

const pick = (items) => items[Math.floor(Math.random() * items.length)];

const randomDateBetween = (start, end) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

// ── catalog seeding ────────────────────────────────────────────────────────

const seedApiProducts = async (sql) => {
  const rows = API_PRODUCTS.map((api_name) => ({ api_name }));

  await sql`
    INSERT INTO api_products ${sql(rows, 'api_name')}
    ON CONFLICT (api_name) DO NOTHING`;

  const all = await sql`SELECT api_product_id, api_name FROM api_products`;
  return new Map(all.map((row) => [row.api_name, row.api_product_id]));
};

// DO NOTHING rather than DO UPDATE: if you have edited a plan's price or copy in
// the database, re-running the seed should not stomp it
const seedPlans = async (sql) => {
  await sql`
    INSERT INTO plans ${sql(PLANS, 'plan_name', 'price_per_month', 'description', 'is_active')}
    ON CONFLICT (plan_name) DO NOTHING`;

  const all = await sql`SELECT plan_id, plan_name FROM plans`;
  return new Map(all.map((row) => [row.plan_name, row.plan_id]));
};

// DO UPDATE here -- limits are the numbers you are most likely to want to retune
const seedPlanLimits = async (sql, planIds, productIds) => {
  const rows = [];

  for (const [planName, limits] of Object.entries(PLAN_LIMITS)) {
    for (const [apiName, monthly_limit] of Object.entries(limits)) {
      rows.push({
        plan_id: planIds.get(planName),
        api_product_id: productIds.get(apiName),
        monthly_limit,
      });
    }
  }

  await sql`
    INSERT INTO plan_api_limits ${sql(rows, 'plan_id', 'api_product_id', 'monthly_limit')}
    ON CONFLICT (plan_id, api_product_id) DO UPDATE
      SET monthly_limit = EXCLUDED.monthly_limit`;

  return rows.length;
};

// the call log pages with "give me rows below this id for this user", so this is
// the index that keeps it an index seek instead of a scan. IF NOT EXISTS makes it
// safe to run on every seed
const ensureUsageIndex = (sql) => sql`
  CREATE INDEX IF NOT EXISTS api_usage_user_id_idx
    ON api_usage (user_id, api_usage_id DESC)`;

const seedCatalog = async (sql) => {
  const productIds = await seedApiProducts(sql);
  const planIds = await seedPlans(sql);
  const limitCount = await seedPlanLimits(sql, planIds, productIds);

  await ensureUsageIndex(sql);

  console.log(
    `Catalog: ${API_PRODUCTS.length} API products, ${PLANS.length} plans, ` +
    `${limitCount} plan/API limits ensured.`);
};

// ── usage seeding ──────────────────────────────────────────────────────────

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

  // a period that has not started yet would make the range negative
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

const insertUsage = async (sql, rows) => {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    // postgres.js expands an array of objects into one multi-row INSERT
    await sql`INSERT INTO api_usage ${sql(chunk, 'user_id', 'api_product_id', 'used_at')}`;
  }
};

const seedUsage = async (sql, reset) => {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM api_usage`;

  if (count > 0 && !reset) {
    console.log(`Usage: api_usage already has ${count} rows. Re-run with --reset to wipe and reseed.`);
    return;
  }

  if (reset && count > 0) {
    await sql`DELETE FROM api_usage`;
    console.log(`Usage: deleted ${count} existing rows.`);
  }

  const targets = await findSeedTargets(sql);

  if (targets.length === 0) {
    console.log('Usage: no active subscriptions -- pick a plan in the app first, then re-run.');
    return;
  }

  const now = new Date();
  let inserted = 0;

  for (const target of targets) {
    const rows = buildRows(target, now);
    if (rows.length === 0) continue;

    await insertUsage(sql, rows);
    inserted += rows.length;
  }

  console.log(`Usage: inserted ${inserted} rows across ${targets.length} user/API pairs.`);
};

// ── entry point ────────────────────────────────────────────────────────────

const sql = createDb();

try {
  await seedCatalog(sql);
  await seedUsage(sql, process.argv.includes('--reset'));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
