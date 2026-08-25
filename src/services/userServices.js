import { InvalidPlanError, AlreadyOnPlanError } from '../errors/userErrors.js';
import { USAGE_PAGE_SIZE } from '../repositories/userRepos.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const utcMidnight = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const daysBetween = (from, to) => (utcMidnight(to) - utcMidnight(from)) / MS_PER_DAY;

const prorateUpgrade = (currentPrice, newPrice, { period_start, next_bill_due }) => {
  const difference = Number(newPrice) - Number(currentPrice);

  // Nothing was paid for a free period, so there is no part-month to credit against.
  if (Number(currentPrice) === 0) return difference.toFixed(2);

  const totalDays = daysBetween(period_start, next_bill_due);
  const daysRemaining = daysBetween(new Date(), next_bill_due);

  // Past the due date the period would have rolled over, so a full period is owed.
  const billableDays = daysRemaining <= 0 ? totalDays : daysRemaining;

  return (difference * billableDays / totalDays).toFixed(2);
};

const assertCard = (price, cardLast4) => {
  if (Number(price) > 0 && !cardLast4) throw new CardRequiredError();
};

export const createUserServices = (userRepo) => ({
  selectPlan: async (userId, planName, cardLast4) => {
    const plan = await userRepo.findActivePlanByName(planName);
    if (!plan) throw new InvalidPlanError(planName);

    const current = await userRepo.findActiveSubscription(userId);

<<<<<<< Updated upstream
    if (!current)
      return userRepo.subscribeToPlan(userId, plan.plan_id, plan.price_per_month, cardLast4);

    if (current.plan_id === plan.plan_id)
      throw new AlreadyOnPlanError();

    return userRepo.changePlan(userId, plan.plan_id, plan.price_per_month, cardLast4);
=======
    if (!current) {
      assertCard(newPlan.price_per_month, cardLast4);

      const paymentId = await userRepo.subscribeToPlan(
        userId, newPlan.plan_id, newPlan.price_per_month, cardLast4);
      return { charged: true, paymentId };
    }

    if (current.plan_id === newPlan.plan_id)
      throw new AlreadyOnPlanError();

    const currentPlan = await userRepo.findPlanById(current.plan_id);

    if (Number(newPlan.price_per_month) <= Number(currentPlan.price_per_month))
      return { charged: false, plan_name: planName };

    assertCard(newPlan.price_per_month, cardLast4);

    const period = await userRepo.findCurrentPeriod(current.subscription_id);
    const amount = prorateUpgrade(
      currentPlan.price_per_month, newPlan.price_per_month, period);

    const paymentId = await userRepo.changePlan(userId, newPlan.plan_id, amount, cardLast4);
    return { charged: true, paymentId };
>>>>>>> Stashed changes
  },

  getCurrentSubscription: async (userId) => {
    return await userRepo.findActiveSubscription(userId) ?? null;
  },

  getUserData: async (userId) => {
    const subscription = await userRepo.findActiveSubscription(userId);
    if (!subscription) return null;

    const subscribedPlan = await userRepo.findPlanById(subscription.plan_id)

    const currentPeriod = await userRepo.findCurrentPeriod(subscription.subscription_id);

    const apiData = await userRepo.getPeriodApiCalls(userId, currentPeriod.period_start, subscription.plan_id); // NECESSARY ITEM 3
    
    const data = {
      plan: subscribedPlan.plan_name,
      plan_start: subscription.started_at,
      price: subscribedPlan.price_per_month,
      bill_start: currentPeriod.period_start,
      bill_due: currentPeriod.next_bill_due,
      apis: apiData
    }

    return data;
  },

  getPlans: async () => {
    return await userRepo.findAllActivePlans();
  },

  getUsageLogPage: async (userId, { api, from, to, cursor }) => {
    const rows = await userRepo.findUsageLogPage(userId, { api, from, to }, cursor);

    const calls = rows.slice(0, USAGE_PAGE_SIZE);
    const logContinues = rows.length > USAGE_PAGE_SIZE;
    const last = logContinues ? calls.at(-1) : null;

    return {
      calls,
      next_cursor: last
        ? { at: new Date(last.used_at).toISOString(), id: last.api_usage_id }
        : null,
    };
  },

  getApiProducts: async () => {
    return await userRepo.findAllApiProducts();
  },

  getPaymentHistory: async (userId) => {
    const payments = await userRepo.findPaymentHistory(userId);

    const subscription = await userRepo.findActiveSubscription(userId);
    if (!subscription) return { payments, upcoming: null };

    const [period, plan] = await Promise.all([
      userRepo.findCurrentPeriod(subscription.subscription_id),
      userRepo.findPlanById(subscription.plan_id),
    ]);

    const upcoming = period && plan
      ? { due_on: period.next_bill_due, amount: plan.price_per_month, plan_name: plan.plan_name }
      : null;

    return { payments, upcoming };
  },
});
