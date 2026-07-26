import {
  AlreadySubscribedError,
  DuplicatePeriodPaymentError,
} from '../errors/userErrors.js';

const UNIQUE_VIOLATION = '23505';

const insertSubscriptionWithPayment = async (sql, userId, planId, pricePerMonth, cardLast4) => {
  const [sub] = await sql`
    INSERT INTO subscriptions (user_id, plan_id)
    VALUES (${userId}, ${planId})
    RETURNING subscription_id, started_at`;

  const [payment] = await sql`
    INSERT INTO payment_history
      (subscription_id, amount_paid, card_last4, period_start)
    VALUES
      (${sub.subscription_id}, ${pricePerMonth}, ${cardLast4},
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

  // the billing cycle the user is currently inside: the most recent payment's
  // period_start, and the same date a month later (when the next bill lands
  // and the usage quotas reset)
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

  // which APIs a plan grants, and how many calls each one allows.
  // a product with no row here is not part of the plan at all
  findPlanApiLimits: async (planId) => {
    return await sql`
      SELECT ap.api_product_id,
             ap.api_name,
             l.monthly_limit::int AS monthly_limit
      FROM plan_api_limits l
      JOIN api_products ap ON ap.api_product_id = l.api_product_id
      WHERE l.plan_id = ${planId}
      ORDER BY ap.api_name`;
  },

  // calls made in the current cycle, per API. products the user never called
  // are simply absent from the result -- the service fills those in as 0.
  // ::int because COUNT() and monthly_limit are int8, which postgres.js hands
  // back as strings to protect precision
  countUsageByProduct: async (userId, periodStart) => {
    return await sql`
      SELECT api_product_id,
             COUNT(*)::int AS calls_used
      FROM api_usage
      WHERE user_id = ${userId}
        AND used_at >= ${periodStart}::date
        AND used_at <  ${periodStart}::date + interval '1 month'
      GROUP BY api_product_id`;
  },

  subscribeToPlan: async (userId, planId, pricePerMonth, cardLast4 = null) => {
    try {
      return await sql.begin((sql) =>
        insertSubscriptionWithPayment(sql, userId, planId, pricePerMonth, cardLast4));
    } catch (err) {
      throw translateUniqueViolation(err);
    }
  },

  changePlan: async (userId, planId, pricePerMonth, cardLast4 = null) => {
    try {
      return await sql.begin(async (sql) => {
        await sql`
          UPDATE subscriptions SET ended_at = now()
          WHERE user_id = ${userId} AND ended_at IS NULL`;

        return insertSubscriptionWithPayment(sql, userId, planId, pricePerMonth, cardLast4);
      });
    } catch (err) {
      throw translateUniqueViolation(err);
    }
  },
});