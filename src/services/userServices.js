import { InvalidPlanError, AlreadyOnPlanError } from '../errors/userErrors.js';

const MAX_PAGES = 50;

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

  getUsageLogPage: async (userId, { page, limit, api, from, to }) => {
    const offset = (page - 1) * limit;

    const { calls, total } = await userRepo.findUsageLogPage(
      userId, { api, from, to }, limit, offset);

    const fullPageCount = Math.max(1, Math.ceil(total / limit));
    const pageCount = Math.min(fullPageCount, MAX_PAGES);

    return {
      calls: page > pageCount ? [] : calls,
      total,
      page,
      page_count: pageCount,
      capped: fullPageCount > MAX_PAGES,
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
