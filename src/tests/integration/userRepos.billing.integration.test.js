import { describe, expect, it } from 'vitest';
import { createUserRepository } from '../../repositories/userRepos.js';
import { makePayment, makePlan, makeSubscription, makeUser } from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

// the driver may hand a date column back as a Date or as 'YYYY-MM-DD'. Both
// normalise to the same UTC calendar day through this.
const utcDay = (value) => new Date(value).toISOString().slice(0, 10);

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

// findCurrentPeriod is keyed on a subscription rather than a user, so each test
// below needs one for payments to hang off
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

    // inserted out of order deliberately. The query orders by period_start, so
    // insertion order must not be what decides this. period_start also has to
    // differ across the three or payment_once_per_period rejects them
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

    // there is no 31st of February, so PostgreSQL clamps to the last day of the
    // month. Expected, not accidental: the period is 28 days at a full month's
    // price, and getPeriodApiCalls windows the quota with the same arithmetic,
    // so the displayed due date and the quota reset agree.
    //
    // 2026 is not a leap year. The dates here are fixed rather than derived
    // from the clock, so this stays 02-28 instead of quietly becoming 02-29
    // every fourth year.
    //
    // The hazard this leaves behind is dormant: nothing writes a period_start
    // except subscribeToPlan and changePlan, so periods never chain today. If
    // recurring billing is ever added and sets the next period_start to this
    // next_bill_due, the anniversary walks backward permanently -- Jan 31 to
    // Feb 28 to Mar 28 to Apr 28. Recomputing from the subscription's
    // started_at each cycle instead keeps it sticky.
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
