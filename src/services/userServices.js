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

  getPlans: async () => {
    return await userRepo.findAllActivePlans();
  },

  // everything the dashboard needs to answer "how much of my plan have I used
  // this cycle, and when does the next bill land". null when the user has no
  // plan -- the same "normal, not an error" state getCurrentSubscription uses
  getUsageSummary: async (userId) => {
    const subscription = await userRepo.findActiveSubscription(userId);
    if (!subscription) return null;

    // subscribing always writes a payment row, so a period normally exists;
    // falling back to the subscription's own start keeps this working if one
    // is ever missing
    const period = await userRepo.findCurrentPeriod(subscription.subscription_id);
    const periodStart = period?.period_start ?? subscription.started_at;

    const [limits, counts] = await Promise.all([
      userRepo.findPlanApiLimits(subscription.plan_id),
      userRepo.countUsageByProduct(userId, periodStart),
    ]);

    const usedByProduct = new Map(counts.map((row) => [row.api_product_id, row.calls_used]));

    // the plan's API list drives the output, not the usage list -- so an API
    // the user has never called still shows up, at 0. this is the whole reason
    // countUsageByProduct can stay a plain COUNT with no outer join
    const apis = limits.map((limit) => {
      const callsUsed = usedByProduct.get(limit.api_product_id) ?? 0;

      return {
        api_product_id: limit.api_product_id,
        api_name: limit.api_name,
        monthly_limit: limit.monthly_limit,
        calls_used: callsUsed,
        calls_remaining: Math.max(limit.monthly_limit - callsUsed, 0),
      };
    });

    return {
      period_start: periodStart,
      next_bill_due: period?.next_bill_due ?? null,
      apis,
    };
  },
});