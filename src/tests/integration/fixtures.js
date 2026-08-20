import { testSql } from './testDb.js';

// Fixtures insert rows directly, never through a repository. If setup went
// through the code under test, one bug there would corrupt the arrange step of
// every other test and produce a wall of unrelated failures.

// users.username, users.email, plans.plan_name and api_products.api_name are
// all UNIQUE, so a hardcoded default would trip 23505 on the second call within
// a single test -- which reads like a bug in the code under test rather than in
// the fixture. Every generated value carries this counter.
//
// vitest runs with isolate: true, so each test file gets its own module
// instance and the counter restarts per file. That is harmless: beforeEach
// truncates, so there is nothing left to collide with.
let sequence = 0;

const next = () => (sequence += 1);

// Anything the database would default from now() -- CURRENT_DATE on
// period_start, now() on used_at -- makes a test's meaning depend on the day it
// runs. Month arithmetic is the worst of it: a "+ 1 month" assertion behaves
// differently in a 31-day month than a 28-day one. These fixed values keep the
// default row deterministic. Exported so a test can reason relative to them
// instead of copying the literal.
export const DEFAULT_PERIOD_START = '2026-03-15';
export const DEFAULT_USED_AT = '2026-03-15T12:00:00Z';

// username is citext -- 'Alice' and 'alice' are the same value as far as
// users_username_key is concerned, so uniqueness here has to survive case
// folding. A numeric suffix does.
export const makeUser = async (overrides = {}) => {
  const n = next();

  const row = {
    username: `user-${n}`,
    hash: `fake-argon2-hash-${n}`,
    email: `user-${n}@example.test`,
    ...overrides,
  };

  const [user] = await testSql`
    INSERT INTO users ${testSql(row)}
    RETURNING *`;

  return user;
};

// price_per_month is numeric, and the driver reads numeric back as a string to
// avoid losing precision to a float. Writing the default as a string keeps the
// fixture speaking the same language the assertions will.
export const makePlan = async (overrides = {}) => {
  const n = next();

  const row = {
    plan_name: `plan-${n}`,
    price_per_month: '9.99',
    description: `Plan ${n}, used in tests`,
    is_active: true,
    ...overrides,
  };

  const [plan] = await testSql`
    INSERT INTO plans ${testSql(row)}
    RETURNING *`;

  return plan;
};

export const makeApiProduct = async (overrides = {}) => {
  const n = next();

  const row = {
    api_name: `api-${n}`,
    ...overrides,
  };

  const [apiProduct] = await testSql`
    INSERT INTO api_products ${testSql(row)}
    RETURNING *`;

  return apiProduct;
};

// Requires plan_id and api_product_id -- they are the composite primary key and
// there is nothing sensible to default them to. Omitting either raises a
// not-null violation naming the column, which is a clear enough failure that a
// guard clause here would only add noise.
export const makePlanLimit = async (overrides = {}) => {
  const row = {
    monthly_limit: 1000,
    ...overrides,
  };

  const [planLimit] = await testSql`
    INSERT INTO plan_api_limits ${testSql(row)}
    RETURNING *`;

  return planLimit;
};

// Requires user_id. Everything else is deliberately absent from the defaults:
//
//   plan_id   is nullable, and a subscription without one is a real case --
//             findPaymentHistory LEFT JOINs plans precisely so those payments
//             still appear. Omit it to get that row.
//   started_at is what subscribeToPlan derives a payment's period_start from,
//             so tests about billing dates need to set it.
//   ended_at  absent means active. Note that one_active_subscription_per_user
//             is a unique index over user_id WHERE ended_at IS NULL, so a user
//             can only hold one row with ended_at absent. To build a plan-change
//             history, give the earlier subscription an explicit ended_at.
export const makeSubscription = async (overrides = {}) => {
  const [subscription] = await testSql`
    INSERT INTO subscriptions ${testSql(overrides)}
    RETURNING *`;

  return subscription;
};

// Requires subscription_id. It is nullable in the schema, but findPaymentHistory
// reaches payments by joining through subscriptions, so a payment without one is
// invisible to every query under test.
//
// paid_at is left to the database on purpose: it is the ORDER BY key, and rows
// need to differ. Separate inserts are separate transactions, so now() advances
// between them -- but only by microseconds, so any test asserting an order
// should set paid_at explicitly rather than trust insertion sequence.
export const makePayment = async (overrides = {}) => {
  const row = {
    amount_paid: '9.99',
    period_start: DEFAULT_PERIOD_START,
    ...overrides,
  };

  const [payment] = await testSql`
    INSERT INTO payment_history ${testSql(row)}
    RETURNING *`;

  return payment;
};

// Requires user_id and api_product_id.
//
// used_at is the most important override in this module. Every boundary case in
// findUsageLogPage and getPeriodApiCalls works by placing a row at a precise
// instant -- the first row inside a window, the first row outside it. The fixed
// default also means two rows created without an override share a used_at
// exactly, which is the tie the pagination ordering needs to be tested against.
export const makeUsage = async (overrides = {}) => {
  const row = {
    used_at: DEFAULT_USED_AT,
    ...overrides,
  };

  const [usage] = await testSql`
    INSERT INTO api_usage ${testSql(row)}
    RETURNING *`;

  return usage;
};

// The pager cap only shows itself past 1,250 calls, and makeUsage would spend
// 1,251 round trips getting there -- slow enough to matter against the 10s
// test timeout. postgres.js turns an array of objects into one multi-row
// INSERT, so the whole seed costs a single round trip.
//
// Every row shares a used_at. The cap is arithmetic over the total, so the
// ordering these rows tie on is beside the point -- and findUsageLogPage
// breaks that tie on api_usage_id, which is covered in the repository tests.
export const makeUsageRows = async (
  count,
  {
    used_at = DEFAULT_USED_AT,
    ...columns
  },
) => {
  const rows = Array.from({ length: count }, () => ({
    ...columns,
    used_at,
  }));

  await testSql`INSERT INTO api_usage ${testSql(rows)}`;
};
