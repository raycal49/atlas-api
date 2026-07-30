import { InvalidPlanError, AlreadyOnPlanError } from '../errors/userErrors.js';

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

  // one numbered page of the call log, plus enough to draw the pager.
  // the whole filter object passes through untouched, so a filter added to the
  // query schema reaches the repository without this function changing
  getUsageLogPage: async (userId, { page, limit, api, from, to }) => {
    const offset = (page - 1) * limit;

    const { calls, total } = await userRepo.findUsageLogPage(
      userId, { api, from, to }, limit, offset);

    return {
      calls,
      total,
      page,
      // at least 1, so an empty log still reads "Page 1 of 1"
      page_count: Math.max(1, Math.ceil(total / limit)),
    };
  },

  getApiProducts: async () => {
    return await userRepo.findAllApiProducts();
  },

  // past payments plus the charge that is coming. both halves live in one
  // response so the page needs a single request rather than stitching three
  // together in the browser
  getPaymentHistory: async (userId) => {
    const payments = await userRepo.findPaymentHistory(userId);

    const subscription = await userRepo.findActiveSubscription(userId);
    if (!subscription) return { payments, upcoming: null };

    const [period, plan] = await Promise.all([
      userRepo.findCurrentPeriod(subscription.subscription_id),
      userRepo.findPlanById(subscription.plan_id),
    ]);

    // the upcoming amount comes from the plan they are on NOW, not from the
    // last payment -- those differ for a whole cycle after a plan change
    const upcoming = period && plan
      ? { due_on: period.next_bill_due, amount: plan.price_per_month, plan_name: plan.plan_name }
      : null;

    return { payments, upcoming };
  },
});
