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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// whole days from today until a billing date. both sides are flattened to UTC
// midnight first: next_bill_due is a calendar date, not an instant, so comparing
// it against a local clock would tip the answer by a day either side of midnight
const daysUntil = (value) => {
  if (!value) return null;

  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;

  const dueMidnight = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());

  const now = new Date();
  const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.round((dueMidnight - todayMidnight) / MS_PER_DAY);
};

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

  // one page of the call log, plus the cursor for the page after it.
  //
  // asks the repository for one row more than the caller wants: if that extra row
  // comes back there is another page, and the client gets a cursor. that is one
  // query instead of a second COUNT, and it never disagrees with the rows shown
  getUsageLog: async (userId, before, limit) => {
    const rows = await userRepo.findUsageLog(userId, before ?? null, limit + 1);

    const hasMore = rows.length > limit;
    const calls = hasMore ? rows.slice(0, limit) : rows;

    return {
      calls,
      // null means this was the last page
      next_before: hasMore ? calls[calls.length - 1].api_usage_id : null,
    };
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

    const nextBillDue = period?.next_bill_due ?? null;

    return {
      period_start: periodStart,
      next_bill_due: nextBillDue,
      days_until_next_bill: daysUntil(nextBillDue),
      total_calls: apis.reduce((sum, api) => sum + api.calls_used, 0),
      api_count: apis.length,
      apis,
    };
  },
});