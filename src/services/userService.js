import {
  InvalidPlanError,
  CardRequiredError,
  AlreadyOnPlanError,
  AlreadyScheduledPlanError,
} from '../errors/subscriptionErrors.js';
import { PAGE_SIZE } from '../repositories/userRepository.js';

// Twin of the date helpers in src/public/js/ui.js (server and browser cannot
// share a module here). Edit both together.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const utcMidnight = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const daysBetween = (from, to) => (utcMidnight(to) - utcMidnight(from)) / MS_PER_DAY;

const prorateUpgrade = (currentPrice, newPrice, { period_start, next_bill_due }) => {
  const difference = Number(newPrice) - Number(currentPrice);

  if (Number(currentPrice) === 0) return difference.toFixed(2);

  const totalDays = daysBetween(period_start, next_bill_due);
  const daysRemaining = daysBetween(new Date(), next_bill_due);

  const billableDays = daysRemaining <= 0 ? totalDays : daysRemaining;

  return (difference * billableDays / totalDays).toFixed(2);
};

const assertCard = (price, cardLast4) => {
  if (Number(price) > 0 && !cardLast4) throw new CardRequiredError();
};

export const createUserService = (userRepo) => ({
  selectPlan: async (userId, planName, cardLast4) => {
    const newPlan = await userRepo.findActivePlanByName(planName);
    if (!newPlan) throw new InvalidPlanError(planName);

    const current = await userRepo.findActiveSubscription(userId);

    if (!current) {
      assertCard(newPlan.price_per_month, cardLast4);

      const paymentId = await userRepo.subscribeToPlan(
        userId, newPlan.plan_id, newPlan.price_per_month, cardLast4);
      return { charged: true, payment_id: paymentId };
    }

    if (current.plan_id === newPlan.plan_id)
      throw new AlreadyOnPlanError();

    if (current.pending_plan_id === newPlan.plan_id)
      throw new AlreadyScheduledPlanError();

    const currentPlan = await userRepo.findPlanById(current.plan_id);

    if (Number(newPlan.price_per_month) <= Number(currentPlan.price_per_month)) {
      await userRepo.schedulePlanChange(userId, newPlan.plan_id);
      return { charged: false, payment_id: null };
    }

    assertCard(newPlan.price_per_month, cardLast4);

    const period = await userRepo.findCurrentPeriod(current.subscription_id);
    const amount = prorateUpgrade(
      currentPlan.price_per_month, newPlan.price_per_month, period);

    const paymentId = await userRepo.changePlan(userId, newPlan.plan_id, amount, cardLast4);
    return { charged: true, payment_id: paymentId };
  },

  getDashboard: async (userId) => {
    const subscription = await userRepo.findActiveSubscription(userId);
    if (!subscription) return null;

    const subscribedPlan = await userRepo.findPlanById(subscription.plan_id)

    const pendingPlan = subscription.pending_plan_id
      ? await userRepo.findPlanById(subscription.pending_plan_id)
      : null;

    const currentPeriod = await userRepo.findCurrentPeriod(subscription.subscription_id);

    const apiData = await userRepo.findPlanLimitsWithUsage(userId, currentPeriod.period_start, subscription.plan_id); // NECESSARY ITEM 3
    
    const data = {
      plan: subscribedPlan.plan_name,
      pending_plan: pendingPlan?.plan_name ?? null,
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

  getUsageLogPage: async (userId, { api_product_id, from, to, cursor }) => {
    const rows = await userRepo.findUsageLogPage(userId, { api_product_id, from, to }, cursor);

    const calls = rows.slice(0, PAGE_SIZE);

    if (rows.length <= PAGE_SIZE) return { calls, next_cursor: null };

    const last = calls.at(-1);

    return {
      calls,
      next_cursor: { at: new Date(last.used_at).toISOString(), id: last.api_usage_id },
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
      userRepo.findPlanById(subscription.pending_plan_id ?? subscription.plan_id),
    ]);

    return {
      payments,
      upcoming: {
        due_on: period.next_bill_due,
        amount: plan.price_per_month,
        plan_name: plan.plan_name,
      },
    };
  },
});
