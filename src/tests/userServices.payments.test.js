import { describe, expect, it } from 'vitest';

import { setup, USER_ID } from './userServicesHarness.js';

const SUBSCRIPTION = {
  subscription_id: '417e-9664',
  plan_id: 'plan-business',
  started_at: '2026-06-15',
};

const CURRENT_PERIOD = {
  period_start: '2026-07-15',
  next_bill_due: '2026-08-15',
};

const CURRENT_PLAN = {
  plan_id: 'plan-business',
  plan_name: 'Business',
  price_per_month: '199.00',
};

const PAYMENTS = [
  { payment_id: 'pay-2', amount_paid: '49.00', paid_at: '2026-07-15T00:00:00.000Z',
    period_start: '2026-07-15', card_last4: 4242, plan_name: 'Developer' },
  { payment_id: 'pay-1', amount_paid: '0.00', paid_at: '2026-06-15T00:00:00.000Z',
    period_start: '2026-06-15', card_last4: null, plan_name: 'Free' },
];

describe('GET /payments/me', () => {
  it('prices the next charge from the current plan, not the last payment', async () => {
    const { service, userRepo } = setup();

    userRepo.findPaymentHistory.mockResolvedValue(PAYMENTS);
    userRepo.findActiveSubscription.mockResolvedValue(SUBSCRIPTION);
    userRepo.findCurrentPeriod.mockResolvedValue(CURRENT_PERIOD);
    userRepo.findPlanById.mockResolvedValue(CURRENT_PLAN);

    const result = await service.getPaymentHistory(USER_ID);

    expect(result.upcoming).toStrictEqual({
      due_on: '2026-08-15',
      amount: '199.00',
      plan_name: 'Business',
    });
  });

  it('has nothing upcoming when the subscription has no billing period yet', async () => {
    const { service, userRepo } = setup();

    userRepo.findPaymentHistory.mockResolvedValue([]);
    userRepo.findActiveSubscription.mockResolvedValue({
      ...SUBSCRIPTION,
      plan_id: 'plan-free',
    });
    userRepo.findCurrentPeriod.mockResolvedValue(undefined);
    userRepo.findPlanById.mockResolvedValue({
      plan_id: 'plan-free',
      plan_name: 'Free',
      price_per_month: '0.00',
    });

    const result = await service.getPaymentHistory(USER_ID);

    expect(result.upcoming).toBe(null);
    expect(result.payments).toStrictEqual([]);
  });
});
