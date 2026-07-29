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

  // one page of the call log, plus the cursor for the page after it.
  //
  // asks the repository for one row more than the caller wants: if that extra row
  // comes back there is another page, and the client gets a cursor. that is one
  // query instead of a second COUNT, and it never disagrees with the rows shown
  getAllAPICalls: async (userId, before, limit) => {
    const rows = await userRepo.findTotalApiCalls(userId, before ?? null, limit + 1);

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

  getApiCallsForPeriod: async (userId) => {
    const subscription = await userRepo.findActiveSubscription(userId);
    if (!subscription) return null;

    const period = await userRepo.findCurrentPeriod(subscription.subscription_id);

    const currentMonthCalls = await userRepo.getPeriodAPICalls(userId, period.periodStart, subscription.planId);

    return currentMonthCalls;
  },

  // this is literally get me the usage this period
  // getApiCallsForPeriod: async (userId) => {
  //   const subscription = await userRepo.findActiveSubscription(userId);
  //   if (!subscription) return null;

    // subscribing always writes a payment row, so a period normally exists;
    // falling back to the subscription's own start keeps this working if one
    // is ever missing

    // but... going off of most recent payment is sort of taking for granted that the most recent payment
    // WILL be accurate, so to speak
    // as it stands, we really don't have any way of *actually* billing the user for successive periods
    // the user just pays once and that's it!

    // we query the database to find most recent payment
    // const period = await userRepo.findCurrentPeriod(subscription.subscription_id);

    // this line basically checks if there is a most recent period
    // if there isn't, we instead go off of subscription.started_at 
    // we will add 1 month to that and pay in that way
    // const periodStart = period.period_start;

    // this holds the individual api limits in limits
    // this also holds api calls the user has made grouped by the name of the api they called
    // const [limits, counts] = await Promise.all([
    //   // this gets the actual usage limits of the various APIs
    //   userRepo.findPlanApiLimits(subscription.plan_id),

    //   // this looks at the api usage rows that have a user_id matching the user's input id--userId
    //   // and then counts them, grouping them by the individual api_product_id's
    //   userRepo.countUsageByProduct(userId, periodStart),
    // ]);

    // const api_limits = limits.map(({api_name, monthly_limit}) => {api_name, monthly_limit});

    // const api_calls = counts.map({api_product})

    // const usedByProduct = new Map(counts.map((row) => [row.api_product_id, row.calls_used]));

    // // the plan's API list drives the output, not the usage list -- so an API
    // // the user has never called still shows up, at 0. this is the whole reason
    // // countUsageByProduct can stay a plain COUNT with no outer join
    // const apis = limits.map((limit) => {
    //   const callsUsed = usedByProduct.get(limit.api_product_id) ?? 0;
    //   const percentUsed = percentOf(callsUsed, limit.monthly_limit);

    //   return {
    //     api_product_id: limit.api_product_id,
    //     api_name: limit.api_name,
    //     monthly_limit: limit.monthly_limit,
    //     calls_used: callsUsed,
    //     calls_remaining: Math.max(limit.monthly_limit - callsUsed, 0),
    //     percent_used: percentUsed,
    //     state: stateFor(percentUsed),
    //   };
    // });

    // const nextBillDue = period?.next_bill_due ?? null;

    // return {
    //   period_start: periodStart,
    //   next_bill_due: nextBillDue,
    //   days_until_next_bill: daysUntil(nextBillDue),
    //   total_calls: apis.reduce((sum, api) => sum + api.calls_used, 0),
    //   api_count: apis.length,
    //   apis,
    // };
  // },
});