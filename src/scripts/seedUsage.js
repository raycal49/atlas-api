// populate db                  "npm run seed:usage"
// reset db then populate db    "npm run seed:usage:reset"

import { createDatabase } from '../config/database.js';
import { hashPassword } from '../services/passwordService.js';

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
    description:
      'For side projects and evaluation. Geocoding and static maps, rate limited.',
    is_active: true,
  },
  {
    plan_name: 'Developer',
    price_per_month: 49,
    description:
      'Routing, reverse geocoding and isochrones for apps in production.',
    is_active: true,
  },
  {
    plan_name: 'Business',
    price_per_month: 199,
    description:
      'The full API surface with headroom for high-traffic applications.',
    is_active: true,
  },
  {
    plan_name: 'Starter (Legacy)',
    price_per_month: 19,
    description: 'Retired tier. Existing subscribers keep their pricing.',
    is_active: false,
  },
];

const PLAN_LIMITS = {
  Free: {
    Geocoding: 250,
    'Static Maps': 500,
  },
  Developer: {
    Geocoding: 1_500,
    'Reverse Geocoding': 1_500,
    Directions: 750,
    'Static Maps': 3_000,
    Isochrone: 500,
  },
  Business: {
    Geocoding: 3_000,
    'Reverse Geocoding': 3_000,
    Directions: 2_000,
    'Static Maps': 6_000,
    Isochrone: 1_000,
    'Distance Matrix': 1_000,
  },
  'Starter (Legacy)': {
    Geocoding: 750,
    'Static Maps': 1_500,
  },
};

const DEMO_USER = {
  username: 'demouser',
  email: 'demo@example.com',
  password: 'demopass123',
};

const DEMO_PLAN = 'Business';

const FILL_LEVELS = [0.05, 0.18, 0.4, 0.62, 0.85, 0.97, 1];

const CHUNK_SIZE = 1_000;

const DEMO_DAYS_ELAPSED = 20;

const pick = (items) => items[Math.floor(Math.random() * items.length)];

const randomDateBetween = (start, end) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

const seedApiProducts = async (sql) => {
  const rows = API_PRODUCTS.map((api_name) => ({ api_name }));

  await sql`
    INSERT INTO api_products ${sql(rows, 'api_name')}
    ON CONFLICT (api_name) DO NOTHING`;

  const all = await sql`SELECT api_product_id, api_name FROM api_products`;
  return new Map(all.map((row) => [row.api_name, row.api_product_id]));
};

const seedPlans = async (sql) => {
  await sql`
    INSERT INTO plans ${sql(PLANS, 'plan_name', 'price_per_month', 'description', 'is_active')}
    ON CONFLICT (plan_name) DO NOTHING`;

  const all = await sql`SELECT plan_id, plan_name FROM plans`;
  return new Map(all.map((row) => [row.plan_name, row.plan_id]));
};

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

const seedCatalog = async (sql) => {
  const productIds = await seedApiProducts(sql);
  const planIds = await seedPlans(sql);
  const limitCount = await seedPlanLimits(sql, planIds, productIds);

  console.log(
    `Catalog: ${API_PRODUCTS.length} API products, ${PLANS.length} plans, ` +
      `${limitCount} plan/API limits ensured.`,
  );
};

const seedDemoAccount = async (sql) => {
  const hash = await hashPassword(DEMO_USER.password);

  await sql`
    INSERT INTO users (username, email, hash)
    VALUES (${DEMO_USER.username}, ${DEMO_USER.email}, ${hash})
    ON CONFLICT (email) DO NOTHING`;

  const [user] = await sql`
    SELECT user_id FROM users WHERE email = ${DEMO_USER.email}`;

  const [active] = await sql`
    SELECT subscription_id FROM subscriptions
    WHERE user_id = ${user.user_id} AND ended_at IS NULL`;

  if (active) {
    console.log(
      `Demo: ${DEMO_USER.username} / ${DEMO_USER.password} already subscribed.`,
    );
    return;
  }

  const [plan] = await sql`
    SELECT plan_id, price_per_month FROM plans WHERE plan_name = ${DEMO_PLAN}`;

  await sql.begin(async (tx) => {
    const [sub] = await tx`
      INSERT INTO subscriptions (user_id, plan_id)
      VALUES (${user.user_id}, ${plan.plan_id})
      RETURNING subscription_id, started_at`;

    await tx`
      INSERT INTO payment_history (subscription_id, amount_paid, card_last4, period_start)
      VALUES (${sub.subscription_id}, ${plan.price_per_month}, '4242',
              (${sub.started_at} AT TIME ZONE 'UTC')::date)`;
  });

  console.log(
    `Demo: ${DEMO_USER.username} / ${DEMO_USER.password} on ${DEMO_PLAN}.`,
  );
};

const backdateFreshPeriods = async (sql) => {
  const fresh = await sql`
    SELECT ph.subscription_id
    FROM payment_history ph
    JOIN subscriptions s ON s.subscription_id = ph.subscription_id
    WHERE s.ended_at IS NULL AND ph.period_start = CURRENT_DATE`;

  if (fresh.length === 0) return 0;

  const ids = fresh.map((row) => row.subscription_id);

  await sql.begin(async (tx) => {
    await tx`
      UPDATE subscriptions
         SET started_at = started_at - ${DEMO_DAYS_ELAPSED}::int * interval '1 day'
       WHERE subscription_id IN ${tx(ids)}`;

    await tx`
      UPDATE payment_history
         SET period_start = period_start - ${DEMO_DAYS_ELAPSED}::int,
             paid_at      = paid_at      - ${DEMO_DAYS_ELAPSED}::int * interval '1 day'
       WHERE subscription_id IN ${tx(ids)} AND period_start = CURRENT_DATE`;
  });

  return fresh.length;
};

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
    await sql`INSERT INTO api_usage ${sql(chunk, 'user_id', 'api_product_id', 'used_at')}`;
  }
};

const seedUsage = async (sql, reset) => {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM api_usage`;

  if (count > 0 && !reset) {
    console.log(
      `Usage: api_usage already has ${count} rows. Re-run with --reset to wipe and reseed.`,
    );
    return;
  }

  if (reset && count > 0) {
    await sql`DELETE FROM api_usage`;
    console.log(`Usage: deleted ${count} existing rows.`);
  }

  const backdated = await backdateFreshPeriods(sql);

  if (backdated > 0)
    console.log(
      `Usage: backdated ${backdated} billing period(s) by ${DEMO_DAYS_ELAPSED} days.`,
    );

  const targets = await findSeedTargets(sql);

  if (targets.length === 0) {
    console.log(
      'Usage: no active subscriptions -- pick a plan in the app first, then re-run.',
    );
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

  console.log(
    `Usage: inserted ${inserted} rows across ${targets.length} user/API pairs.`,
  );
};

const sql = createDatabase();

try {
  await seedCatalog(sql);
  await seedDemoAccount(sql);
  await seedUsage(sql, process.argv.includes('--reset'));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
