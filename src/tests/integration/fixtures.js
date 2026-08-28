import { testSql } from './testDb.js';

let sequence = 0;

const next = () => (sequence += 1);

export const DEFAULT_PERIOD_START = '2026-03-15';
export const DEFAULT_USED_AT = '2026-03-15T12:00:00Z';

// DEFAULT_USED_AT plus `index` seconds, for rows that must not share an instant
export const secondsApart = (index) =>
  new Date(Date.UTC(2026, 2, 15, 12, 0, index)).toISOString();

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

export const makeSubscription = async (overrides = {}) => {
  const [subscription] = await testSql`
    INSERT INTO subscriptions ${testSql(overrides)}
    RETURNING *`;

  return subscription;
};

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

export const makeUsageRows = async (
  count,
  { used_at = DEFAULT_USED_AT, ...columns },
) => {
  const rows = Array.from({ length: count }, () => ({
    ...columns,
    used_at,
  }));

  await testSql`INSERT INTO api_usage ${testSql(rows)}`;
};
