import { describe, expect, it, } from 'vitest';
import { AlreadySubscribedError } from '../../errors/subscriptionErrors.js';
import { createUserRepository } from '../../repositories/userRepository.js';
import { makePlan, makeUser, } from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);
const utcDay = (value) => new Date(value).toISOString().slice(0, 10);

describe('subscribeToPlan', () => {
  it('creates an active subscription and bills it', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: '19.99' });

    const paymentId = await userRepository.subscribeToPlan(
      user.user_id,
      plan.plan_id,
      plan.price_per_month,
      '4242',
    );

    const [row] = await testSql`
      SELECT s.user_id, s.plan_id, s.ended_at, p.amount_paid, p.card_last4
      FROM payment_history p
      JOIN subscriptions s ON s.subscription_id = p.subscription_id
      WHERE p.payment_id = ${paymentId}`;

    expect(row).toEqual({
      user_id: user.user_id,
      plan_id: plan.plan_id,
      ended_at: null,
      amount_paid: '19.99',
      card_last4: '4242',
    });
  });

  it('partial index one_active_subscription_per_user refuses second active subscription', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: '19.99' });

    const subscribe = () =>
      userRepository.subscribeToPlan(user.user_id, plan.plan_id, '19.99');

    await subscribe();

    const error = await subscribe().catch((err) => err);

    expect(error).toBeInstanceOf(AlreadySubscribedError);
    expect(error.cause.constraint_name).toBe('one_active_subscription_per_user');
  });

  it('leaves no subscription behind when the payment cannot be written', async () => {
    const user = await makeUser();
    const plan = await makePlan();

    await expect(
      userRepository.subscribeToPlan(user.user_id, plan.plan_id, null),
    ).rejects.toThrow();

    const subscriptions = await testSql`
      SELECT subscription_id
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscriptions).toHaveLength(0);
  });
});

describe('changePlan', () => {
  it('ends the current subscription and opens one on the new plan', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan({ price_per_month: '9.99' });
    const newPlan = await makePlan({ price_per_month: '29.99' });

    await userRepository.subscribeToPlan(
      user.user_id,
      oldPlan.plan_id,
      oldPlan.price_per_month,
    );

    await userRepository.changePlan(
      user.user_id,
      newPlan.plan_id,
      newPlan.price_per_month,
      '1234',
    );

    const subscriptions = await testSql`
      SELECT s.plan_id, s.ended_at, p.amount_paid, p.card_last4
      FROM subscriptions s
      JOIN payment_history p ON p.subscription_id = s.subscription_id
      WHERE s.user_id = ${user.user_id}
      ORDER BY s.started_at`;

    expect(subscriptions).toMatchObject([
      { plan_id: oldPlan.plan_id, ended_at: expect.any(Date), amount_paid: '9.99' },
      { plan_id: newPlan.plan_id, ended_at: null, amount_paid: '29.99', card_last4: '1234' },
    ]);
  });

  it('keeps current plan active when plan change fails', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan();
    const newPlan = await makePlan();

    await userRepository.subscribeToPlan(
      user.user_id,
      oldPlan.plan_id,
      oldPlan.price_per_month,
    );

    const noAmountPaid = null;

    await expect(
      userRepository.changePlan(user.user_id, newPlan.plan_id, noAmountPaid),
    ).rejects.toThrow();

    const subscriptions = await testSql`
      SELECT plan_id, ended_at
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscriptions).toMatchObject([
      { plan_id: oldPlan.plan_id, ended_at: null },
    ]);
  });
});

describe('schedulePlanChange', () => {
  it('records the pending plan and leaves the active subscription in place', async () => {
    const user = await makeUser();
    const plan = await makePlan();
    const pendingPlan = await makePlan();

    await userRepository.subscribeToPlan(
      user.user_id,
      plan.plan_id,
      plan.price_per_month,
    );

    await userRepository.schedulePlanChange(user.user_id, pendingPlan.plan_id);

    const [subscription] = await testSql`
      SELECT plan_id, pending_plan_id, ended_at
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscription).toEqual({
      plan_id: plan.plan_id,
      pending_plan_id: pendingPlan.plan_id,
      ended_at: null,
    });
  });

  it('replaces a pending plan rather than accumulating them', async () => {
    const user = await makeUser();
    const plan = await makePlan();
    const firstPlan = await makePlan();
    const secondPlan = await makePlan();

    await userRepository.subscribeToPlan(
      user.user_id,
      plan.plan_id,
      plan.price_per_month,
    );

    await userRepository.schedulePlanChange(user.user_id, firstPlan.plan_id);
    await userRepository.schedulePlanChange(user.user_id, secondPlan.plan_id);

    const subscriptions = await testSql`
      SELECT plan_id, pending_plan_id
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscriptions).toEqual([
      { plan_id: plan.plan_id, pending_plan_id: secondPlan.plan_id },
    ]);
  });

  it('schedules against the active subscription and not an ended one', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan();
    const newPlan = await makePlan();
    const pendingPlan = await makePlan();

    await userRepository.subscribeToPlan(
      user.user_id,
      oldPlan.plan_id,
      oldPlan.price_per_month,
    );

    await userRepository.changePlan(
      user.user_id,
      newPlan.plan_id,
      newPlan.price_per_month,
    );

    await userRepository.schedulePlanChange(user.user_id, pendingPlan.plan_id);

    const subscriptions = await testSql`
      SELECT plan_id, pending_plan_id
      FROM subscriptions
      WHERE user_id = ${user.user_id}
      ORDER BY started_at`;

    expect(subscriptions).toEqual([
      { plan_id: oldPlan.plan_id, pending_plan_id: null },
      { plan_id: newPlan.plan_id, pending_plan_id: pendingPlan.plan_id },
    ]);
  });
});
