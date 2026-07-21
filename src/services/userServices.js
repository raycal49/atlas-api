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
});