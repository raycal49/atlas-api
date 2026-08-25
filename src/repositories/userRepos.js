import {
  AlreadySubscribedError,
  DuplicatePeriodPaymentError,
} from '../errors/userErrors.js';

const UNIQUE_VIOLATION = '23505';

export const USAGE_PAGE_SIZE = 25;

const insertSubscriptionWithPayment = async (sql, userId, planId, amount, cardLast4) => {
  const [sub] = await sql`
    INSERT INTO subscriptions (user_id, plan_id)
    VALUES (${userId}, ${planId})
    RETURNING subscription_id, started_at`;

  const [payment] = await sql`
    INSERT INTO payment_history
      (subscription_id, amount_paid, card_last4, period_start)
    VALUES
      (${sub.subscription_id}, ${amount}, ${cardLast4},
       (${sub.started_at} AT TIME ZONE 'UTC')::date)
    RETURNING payment_id`;

  return payment.payment_id;
};

const translateUniqueViolation = (err) => {
  if (err.code === UNIQUE_VIOLATION) {
    if (err.constraint_name === 'one_active_subscription_per_user')
      return new AlreadySubscribedError({ cause: err });
    if (err.constraint_name === 'payment_once_per_period')
      return new DuplicatePeriodPaymentError({ cause: err });
  }
  return err;
};

export const createUserRepository = (sql) => ({
  findAllActivePlans: async () => {
    return await sql`
      SELECT plan_id, plan_name, price_per_month, description
      FROM plans
      WHERE is_active = true
      ORDER BY price_per_month`;
  },

  findActivePlanByName: async (planName) => {
    const rows = await sql`
      SELECT plan_id, price_per_month FROM plans
      WHERE plan_name = ${planName} AND is_active = true`;
    return rows[0];
  },

  findActiveSubscription: async (userId) => {
    const rows = await sql`
      SELECT subscription_id, plan_id, started_at
      FROM subscriptions
      WHERE user_id = ${userId} AND ended_at IS NULL`;
    return rows[0];
  },

  findCurrentPeriod: async (subscriptionId) => {
    const rows = await sql`
      SELECT period_start,
             (period_start + interval '1 month')::date AS next_bill_due
      FROM payment_history
      WHERE subscription_id = ${subscriptionId}
      ORDER BY period_start DESC
      LIMIT 1`;
    return rows[0];
  },

  findPaymentHistory: async (userId) => {
    return await sql`
      SELECT ph.payment_id,
             ph.amount_paid,
             ph.paid_at,
             ph.period_start,
             ph.card_last4,
             p.plan_name
      FROM payment_history ph
      JOIN subscriptions s ON s.subscription_id = ph.subscription_id
      LEFT JOIN plans p    ON p.plan_id = s.plan_id
      WHERE s.user_id = ${userId}
      ORDER BY ph.paid_at DESC`;
  },

  findPlanById: async (planId) => {
    const rows = await sql`
      SELECT plan_id, plan_name, price_per_month
      FROM plans
      WHERE plan_id = ${planId}`;
    return rows[0];
  },

  findUsageLogPage: async (userId, { api, from, to }, cursor) => {
    const filters = sql`
      u.user_id = ${userId}
      ${api ? sql`AND u.api_product_id = ${api}` : sql``}
      ${from ? sql`AND u.used_at >= ${from}::timestamptz` : sql``}
      ${to ? sql`AND u.used_at <  ${to}::timestamptz` : sql``}`;

    const keyset = cursor
      ? sql`AND (u.used_at, u.api_usage_id) < (${cursor.at}::timestamptz, ${cursor.id}::bigint)`
      : sql``;

    return await sql`
      SELECT u.api_usage_id, u.used_at, ap.api_name
      FROM api_usage u JOIN api_products ap ON ap.api_product_id = u.api_product_id
      WHERE ${filters}
      ${keyset}
      ORDER BY u.used_at DESC, u.api_usage_id DESC
      LIMIT ${USAGE_PAGE_SIZE + 1}`;
  },

  findAllApiProducts: async () => {
    return await sql`
      SELECT api_product_id, api_name
      FROM api_products
      ORDER BY api_name`;
  },

  getPeriodApiCalls: async (userId, periodStart, planId) => {
    return await sql`
    SELECT ap.api_product_id,
           ap.api_name,
           l.monthly_limit::int AS monthly_limit,
           (
              SELECT COUNT(*)::int
                  FROM api_usage u
                  WHERE u.user_id = ${userId}
                  AND u.api_product_id = l.api_product_id
                  AND u.used_at >= ${periodStart}::date
                  AND u.used_at <  ${periodStart}::date + interval '1 month'
            ) AS calls_used
    FROM plan_api_limits l
    JOIN api_products ap ON ap.api_product_id = l.api_product_id
    WHERE l.plan_id = ${planId}
    ORDER BY ap.api_name`
  },

  subscribeToPlan: async (userId, planId, amount, cardLast4 = null) => {
    try {
      return await sql.begin((sql) =>
        insertSubscriptionWithPayment(sql, userId, planId, amount, cardLast4));
    } catch (err) {
      throw translateUniqueViolation(err);
    }
  },

  changePlan: async (userId, planId, amount, cardLast4 = null) => {
    try {
      return await sql.begin(async (sql) => {
        await sql`
          UPDATE subscriptions SET ended_at = now()
          WHERE user_id = ${userId} AND ended_at IS NULL`;

        return insertSubscriptionWithPayment(sql, userId, planId, amount, cardLast4);
      });
    } catch (err) {
      throw translateUniqueViolation(err);
    }
  },
});