import { InvalidPlanError, AlreadyOnPlanError } from '../errors/userErrors.js';

// when an API is close enough to its quota to warn about, and when it is spent.
// these are product rules, not styling -- the same thresholds would decide
// whether to send a "you're running low" email, so they live here rather than
// in the browser
const WARNING_AT = 80;
const CRITICAL_AT = 100;

// capped at 100 so an over-limit API can't report 130% (and overflow a bar);
// the limit > 0 guard keeps a zero quota from dividing to Infinity
const percentOf = (used, limit) =>
  limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;

const stateFor = (percent) =>
  percent >= CRITICAL_AT ? 'critical' : percent >= WARNING_AT ? 'warning' : 'ok';

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
      const percentUsed = percentOf(callsUsed, limit.monthly_limit);

      return {
        api_product_id: limit.api_product_id,
        api_name: limit.api_name,
        monthly_limit: limit.monthly_limit,
        calls_used: callsUsed,
        calls_remaining: Math.max(limit.monthly_limit - callsUsed, 0),
        percent_used: percentUsed,
        state: stateFor(percentUsed),
      };
    });

    return {
      period_start: periodStart,
      next_bill_due: period?.next_bill_due ?? null,
      apis,
    };
  },
});