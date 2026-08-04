import { describe, expect, it } from 'vitest';
import { createUserRepository } from '../../repositories/userRepos.js';
import { makePayment, makePlan, makeSubscription, makeUser } from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

describe('findPaymentHistory', () => {
  it('returns payments from every subscription the user has held', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan({ plan_name: 'starter' });
    const newPlan = await makePlan({ plan_name: 'pro' });

    // an ended subscription and the current one. The earlier row must carry an
    // ended_at: one_active_subscription_per_user only permits a single row per
    // user with ended_at unset
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

    // the join runs through all of the user's subscriptions, not just the
    // active one. Scoping it to the current subscription would silently
    // shorten every user's billing history at the moment they change plans
    expect(history).toHaveLength(2);

    const byId = (id) => history.find((row) => row.payment_id === id);

    expect(byId(oldPayment.payment_id).plan_name).toBe('starter');
    expect(byId(newPayment.payment_id).plan_name).toBe('pro');
  });

  it('returns a payment whose subscription has no plan, with a null plan name', async () => {
    const user = await makeUser();

    // plan_id is nullable and left unset here
    const subscription = await makeSubscription({ user_id: user.user_id });

    const payment = await makePayment({
      subscription_id: subscription.subscription_id,
    });

    const history = await userRepository.findPaymentHistory(user.user_id);

    // plans is a LEFT JOIN so the payment survives a subscription that cannot
    // be named. Changing it to a plain JOIN is a near-invisible edit that
    // deletes these rows from the user's history entirely
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

    // paid_at is set explicitly rather than left to the database: separate
    // inserts differ by microseconds, which is too fine to assert an order on.
    // period_start has to differ too, or payment_once_per_period rejects them
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

    // this one returns the rowset rather than rows[0], so the empty case is an
    // empty array and callers can map over it without a null check
    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(0);
  });
});
