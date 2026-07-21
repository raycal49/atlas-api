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