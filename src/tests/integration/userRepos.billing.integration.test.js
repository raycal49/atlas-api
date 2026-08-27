import { describe, expect, it } from 'vitest';
import { createUserRepository } from '../../repositories/userRepos.js';
import { makePayment, makePlan, makeSubscription, makeUser } from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

const utcDay = (value) => new Date(value).toISOString().slice(0, 10);

const makeBillableSubscription = async () => {
  const user = await makeUser();
  const plan = await makePlan();

  return makeSubscription({
    user_id: user.user_id,
    plan_id: plan.plan_id,
  });
};

describe('findPaymentHistory', () => {
  it('returns payments from every subscription the user has held', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan({ plan_name: 'starter' });
    const newPlan = await makePlan({ plan_name: 'pro' });

    const starterPaymentId = await userRepository.subscribeToPlan(
      user.user_id,
      oldPlan.plan_id,
      oldPlan.price_per_month,
    );

    const proPaymentId = await userRepository.changePlan(
      user.user_id,
      newPlan.plan_id,
      newPlan.price_per_month,
    );

    const history = await userRepository.findPaymentHistory(user.user_id);

    expect(history).toMatchObject([
      { payment_id: proPaymentId, plan_name: 'pro' },
      { payment_id: starterPaymentId, plan_name: 'starter' },
    ]);
  });

  it('returns an empty list for a user who has never paid', async () => {
    const user = await makeUser();

    const history = await userRepository.findPaymentHistory(user.user_id);

    expect(history).toHaveLength(0);
  });
});

describe('findCurrentPeriod', () => {
  it('reads the most recent period, not the first one recorded', async () => {
    const subscription = await makeBillableSubscription();

    await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-01-01',
    });
    await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-03-01',
    });
    await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-02-01',
    });

    const period = await userRepository.findCurrentPeriod(
      subscription.subscription_id,
    );

    expect(utcDay(period.period_start)).toBe('2026-03-01');
  });
});
