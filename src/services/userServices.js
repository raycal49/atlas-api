import { InvalidPlanError, AlreadyOnPlanError } from '../errors/userErrors.js';

export const createUserServices = (UserRepo) => ({
  selectPlan: async (userId, planName, cardLast4) => {
    const plan = await subscriptionRepo.findActivePlanByName(planName);
    if (!plan) throw new InvalidPlanError(planName);

    const current = await subscriptionRepo.findActiveSubscription(userId);

    if (!current)
      return subscriptionRepo.subscribeToPlan(userId, plan.plan_id, plan.price_per_month, cardLast4);

    if (current.plan_id === plan.plan_id)
      throw new AlreadyOnPlanError();

    return subscriptionRepo.changePlan(userId, plan.plan_id, plan.price_per_month, cardLast4);
  },

  getCurrentSubscription: async (userId) => {
    return await subscriptionRepo.findActiveSubscription(userId) ?? null;
  },
});