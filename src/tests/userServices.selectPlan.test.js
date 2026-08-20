import { describe, expect, it } from 'vitest';

import { AlreadyOnPlanError } from '../errors/userErrors.js';
import { setup, USER_ID } from './userServicesHarness.js';

const CARD_LAST4 = '4211';

const CURRENT_PLAN_ID = '06188b55-8cf3';
const OTHER_PLAN_ID = '12627n25-1ce9';

const ACTIVE_SUBSCRIPTION = {
  subscriptionId: '417e-9664',
  plan_id: CURRENT_PLAN_ID,
  started_at: '2012-02-12',
};

const CHANGED_SUBSCRIPTION = {
  subscription_id: '200z-5142',
  started_at: '2012-02-12',
};

// The route itself is covered end to end in
// integration/http/subscriptions.integration.test.js. What is left here are the
// two branches selectPlan takes when the user already holds a subscription --
// awkward to reach through HTTP, cheap to enumerate against a stub.
describe('POST /subscriptions', () => {
  it('rejects a plan the user is already on', async () => {
    const { service, userRepo } = setup();

    userRepo.findActivePlanByName.mockResolvedValue({
      plan_id: CURRENT_PLAN_ID,
      price_per_month: 14.99,
    });
    userRepo.findActiveSubscription.mockResolvedValue(ACTIVE_SUBSCRIPTION);

    await expect(
      service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4),
    ).rejects.toThrow(AlreadyOnPlanError);
  });

  it('changes the plan when they pick a different one', async () => {
    const { service, userRepo } = setup();

    userRepo.findActivePlanByName.mockResolvedValue({
      plan_id: OTHER_PLAN_ID,
      price_per_month: 14.99,
    });
    userRepo.findActiveSubscription.mockResolvedValue(ACTIVE_SUBSCRIPTION);
    userRepo.changePlan.mockResolvedValue(CHANGED_SUBSCRIPTION);

    const result = await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

    expect(result).toStrictEqual(CHANGED_SUBSCRIPTION);
  });
});
