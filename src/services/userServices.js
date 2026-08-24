import { InvalidPlanError, AlreadyOnPlanError } from '../errors/userErrors.js';
import { USAGE_PAGE_SIZE } from '../repositories/userRepos.js';

export const createUserServices = (userRepo) => ({
  selectPlan: async (userId, planName, cardLast4) => {
    const plan = await userRepo.findActivePlanByName(planName);
    if (!plan) throw new InvalidPlanError(planName);

    const current = await userRepo.findActiveSubscription(userId);

    if (!current)
      return userRepo.subscribeToPlan(userId, plan.plan_id, plan.price_per_month, cardLast4);

    if (current.plan_id === plan.plan_id)
      throw new AlreadyOnPlanError();

    return userRepo.changePlan(userId, plan.plan_id, plan.price_per_month, cardLast4);
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
