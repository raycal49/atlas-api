import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AlreadyOnPlanError,
  AlreadyScheduledPlanError,
  CardRequiredError,
} from '../../errors/subscriptionErrors.js';
import { setup, USER_ID } from './userServiceHarness.js';

const CARD_LAST4 = '4211';

const CURRENT_PLAN_ID = '06188b55-8cf3';
const OTHER_PLAN_ID = '12627n25-1ce9';
const THIRD_PLAN_ID = '55031f80-2b7c';

const ACTIVE_SUBSCRIPTION = {
  subscription_id: '417e-9664',
  plan_id: CURRENT_PLAN_ID,
  pending_plan_id: null,
  started_at: '2012-02-12',
};

const PAYMENT_ID = '200z-5142';

const PERIOD = { period_start: '2026-03-15', next_bill_due: '2026-04-15' };

const arrangeUpgrade = (userRepo, period = PERIOD) => {
  userRepo.findActivePlanByName.mockResolvedValue({
    plan_id: OTHER_PLAN_ID,
    price_per_month: '199',
  });
  userRepo.findActiveSubscription.mockResolvedValue(ACTIVE_SUBSCRIPTION);
  userRepo.findPlanById.mockResolvedValue({ price_per_month: '49' });
  userRepo.findCurrentPeriod.mockResolvedValue(period);
  userRepo.changePlan.mockResolvedValue(PAYMENT_ID);
};

const amountCharged = (userRepo) => userRepo.changePlan.mock.calls[0][2];

describe('userService.selectPlan', () => {
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
    userRepo.findPlanById.mockResolvedValue({ price_per_month: 9.99 });
    userRepo.findCurrentPeriod.mockResolvedValue(PERIOD);
    userRepo.changePlan.mockResolvedValue(PAYMENT_ID);

    const result = await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

    expect(result).toStrictEqual({ charged: true, payment_id: PAYMENT_ID });
  });

  it('rejects a paid plan when no card is supplied', async () => {
    const { service, userRepo } = setup();

    userRepo.findActivePlanByName.mockResolvedValue({
      plan_id: OTHER_PLAN_ID,
      price_per_month: 14.99,
    });

    await expect(service.selectPlan(USER_ID, 'SuperSaver')).rejects.toThrow(
      CardRequiredError,
    );
  });

  it('schedules without charging when they pick a cheaper plan', async () => {
    const { service, userRepo } = setup();

    userRepo.findActivePlanByName.mockResolvedValue({
      plan_id: OTHER_PLAN_ID,
      price_per_month: 9.99,
    });
    userRepo.findActiveSubscription.mockResolvedValue(ACTIVE_SUBSCRIPTION);
    userRepo.findPlanById.mockResolvedValue({ price_per_month: 14.99 });

    const result = await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

    expect(result).toStrictEqual({ charged: false, payment_id: null });
    expect(userRepo.changePlan).not.toHaveBeenCalled();
    expect(userRepo.subscribeToPlan).not.toHaveBeenCalled();
    expect(userRepo.schedulePlanChange).toHaveBeenCalledWith(
      USER_ID,
      OTHER_PLAN_ID,
    );
  });

  it('does not require a card to schedule a downgrade to a paid plan', async () => {
    const { service, userRepo } = setup();

    userRepo.findActivePlanByName.mockResolvedValue({
      plan_id: OTHER_PLAN_ID,
      price_per_month: '49',
    });
    userRepo.findActiveSubscription.mockResolvedValue(ACTIVE_SUBSCRIPTION);
    userRepo.findPlanById.mockResolvedValue({ price_per_month: '199' });

    const result = await service.selectPlan(USER_ID, 'SuperSaver');

    expect(result).toStrictEqual({ charged: false, payment_id: null });
    expect(userRepo.changePlan).not.toHaveBeenCalled();
  });

  it('rejects a plan that is already scheduled for the next cycle', async () => {
    const { service, userRepo } = setup();

    userRepo.findActivePlanByName.mockResolvedValue({
      plan_id: OTHER_PLAN_ID,
      price_per_month: '9.99',
    });
    userRepo.findActiveSubscription.mockResolvedValue({
      ...ACTIVE_SUBSCRIPTION,
      pending_plan_id: OTHER_PLAN_ID,
    });

    await expect(
      service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4),
    ).rejects.toThrow(AlreadyScheduledPlanError);

    expect(userRepo.schedulePlanChange).not.toHaveBeenCalled();
  });

  it('replaces a pending downgrade when they schedule a different plan', async () => {
    const { service, userRepo } = setup();

    userRepo.findActivePlanByName.mockResolvedValue({
      plan_id: THIRD_PLAN_ID,
      price_per_month: '49',
    });
    userRepo.findActiveSubscription.mockResolvedValue({
      ...ACTIVE_SUBSCRIPTION,
      pending_plan_id: OTHER_PLAN_ID,
    });
    userRepo.findPlanById.mockResolvedValue({ price_per_month: '199' });

    const result = await service.selectPlan(USER_ID, 'Developer');

    expect(result).toStrictEqual({ charged: false, payment_id: null });
    expect(userRepo.schedulePlanChange).toHaveBeenCalledWith(
      USER_ID,
      THIRD_PLAN_ID,
    );
    expect(userRepo.changePlan).not.toHaveBeenCalled();
  });

  it('charges an upgrade immediately even while a downgrade is pending', async () => {
    const { service, userRepo } = setup();

    arrangeUpgrade(userRepo);
    userRepo.findActiveSubscription.mockResolvedValue({
      ...ACTIVE_SUBSCRIPTION,
      pending_plan_id: THIRD_PLAN_ID,
    });

    const result = await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

    expect(result).toStrictEqual({ charged: true, payment_id: PAYMENT_ID });
    expect(userRepo.schedulePlanChange).not.toHaveBeenCalled();
  });

  describe('proration on upgrade', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    it('charges only for the days left in the period', async () => {
      const { service, userRepo } = setup();
      arrangeUpgrade(userRepo);
      vi.setSystemTime(new Date('2026-03-25T14:03:00Z'));

      await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

      expect(amountCharged(userRepo)).toBe('101.61');
    });

    it('charges the full difference when upgrading on the first day', async () => {
      const { service, userRepo } = setup();
      arrangeUpgrade(userRepo);
      vi.setSystemTime(new Date('2026-03-15T09:00:00Z'));

      await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

      expect(amountCharged(userRepo)).toBe('150.00');
    });

    it('charges the full difference once the period is past due', async () => {
      const { service, userRepo } = setup();
      arrangeUpgrade(userRepo);
      vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));

      await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

      expect(amountCharged(userRepo)).toBe('150.00');
    });

    it('charges full price when upgrading off a free plan', async () => {
      const { service, userRepo } = setup();
      arrangeUpgrade(userRepo);
      userRepo.findPlanById.mockResolvedValue({ price_per_month: '0' });
      vi.setSystemTime(new Date('2026-04-10T00:00:00Z'));

      await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

      expect(amountCharged(userRepo)).toBe('199.00');
    });

    it('divides by the real length of a short month', async () => {
      const { service, userRepo } = setup();
      arrangeUpgrade(userRepo, {
        period_start: '2026-01-31',
        next_bill_due: '2026-02-28',
      });
      vi.setSystemTime(new Date('2026-02-14T00:00:00Z'));

      await service.selectPlan(USER_ID, 'SuperSaver', CARD_LAST4);

      expect(amountCharged(userRepo)).toBe('75.00');
    });
  });
});
