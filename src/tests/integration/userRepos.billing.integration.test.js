import { describe, expect, it } from 'vitest';
import { createUserRepository } from '../../repositories/userRepos.js';
import { makePayment, makePlan, makeSubscription, makeUser } from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

const utcDay = (value) => new Date(value).toISOString().slice(0, 10);

describe('findPaymentHistory', () => {
  it('returns payments from every subscription the user has held', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan({ plan_name: 'starter' });
    const newPlan = await makePlan({ plan_name: 'pro' });

    const ended = await makeSubscription({
      user_id: user.user_id,
      plan_id: oldPlan.plan_id,
      ended_at: '2026-02-01T00:00:00Z',
    });
    const current = await makeSubscription({
      user_id: user.user_id,
      plan_id: newPlan.plan_id,
    });

    const oldPayment = await makePayment({
      subscription_id: ended.subscription_id,
      period_start: '2026-01-01',
      paid_at: '2026-01-01T12:00:00Z',
    });
    const newPayment = await makePayment({
      subscription_id: current.subscription_id,
      period_start: '2026-02-01',
      paid_at: '2026-02-01T12:00:00Z',
    });

    const history = await userRepository.findPaymentHistory(user.user_id);

    expect(history).toHaveLength(2);

    const byId = (id) => history.find((row) => row.payment_id === id);

    expect(byId(oldPayment.payment_id).plan_name).toBe('starter');
    expect(byId(newPayment.payment_id).plan_name).toBe('pro');
  });

  it('returns a payment whose subscription has no plan, with a null plan name', async () => {
    const user = await makeUser();

    const subscription = await makeSubscription({ user_id: user.user_id });

    const payment = await makePayment({
      subscription_id: subscription.subscription_id,
    });

    const history = await userRepository.findPaymentHistory(user.user_id);

    expect(history).toHaveLength(1);
    expect(history[0].payment_id).toBe(payment.payment_id);
    expect(history[0].plan_name).toBeNull();
  });

  it('orders payments newest first', async () => {
    const user = await makeUser();
    const plan = await makePlan();
    const subscription = await makeSubscription({
      user_id: user.user_id,
      plan_id: plan.plan_id,
    });

    const oldest = await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-01-01',
      paid_at: '2026-01-01T12:00:00Z',
    });
    const middle = await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-02-01',
      paid_at: '2026-02-01T12:00:00Z',
    });
    const newest = await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-03-01',
      paid_at: '2026-03-01T12:00:00Z',
    });

    const history = await userRepository.findPaymentHistory(user.user_id);

    expect(history.map((row) => row.payment_id)).toEqual([
      newest.payment_id,
      middle.payment_id,
      oldest.payment_id,
    ]);
  });

  it('returns an empty list for a user who has never paid', async () => {
    const user = await makeUser();

    const history = await userRepository.findPaymentHistory(user.user_id);

    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(0);
  });
});

const makeBillableSubscription = async () => {
  const user = await makeUser();
  const plan = await makePlan();

  return makeSubscription({
    user_id: user.user_id,
    plan_id: plan.plan_id,
  });
};

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

  it('opens the next bill a month after the period started', async () => {
    const subscription = await makeBillableSubscription();

    await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-03-15',
    });

    const period = await userRepository.findCurrentPeriod(
      subscription.subscription_id,
    );

    expect(utcDay(period.period_start)).toBe('2026-03-15');
    expect(utcDay(period.next_bill_due)).toBe('2026-04-15');
  });

  it('clamps a month-end period to the last day of a shorter month', async () => {
    const subscription = await makeBillableSubscription();

    await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: '2026-01-31',
    });

    const period = await userRepository.findCurrentPeriod(
      subscription.subscription_id,
    );

    expect(utcDay(period.next_bill_due)).toBe('2026-02-28');
  });

  it('returns undefined for a subscription that has never been billed', async () => {
    const subscription = await makeBillableSubscription();

    const period = await userRepository.findCurrentPeriod(
      subscription.subscription_id,
    );

    expect(period).toBeUndefined();
  });
});
