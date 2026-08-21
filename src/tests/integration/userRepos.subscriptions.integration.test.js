import { describe, expect, it, } from 'vitest';
import { AlreadySubscribedError } from '../../errors/userErrors.js';
import { createUserRepository } from '../../repositories/userRepos.js';
import { makePlan, makeUser, } from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);
const utcDay = (value) => new Date(value).toISOString().slice(0, 10);

describe('subscribeToPlan', () => {
  it('creates an active subscription and bills it once', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: '19.99' });

    const paymentId = await userRepository.subscribeToPlan(
      user.user_id,
      plan.plan_id,
      plan.price_per_month,
      '4242',
    );

    const [subscription] = await testSql`
      SELECT subscription_id, plan_id, ended_at
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscription.plan_id).toBe(plan.plan_id);
    expect(subscription.ended_at).toBeNull();

    const [payment] = await testSql`
      SELECT subscription_id, amount_paid, card_last4
      FROM payment_history
      WHERE payment_id = ${paymentId}`;

    expect(payment.subscription_id).toBe(subscription.subscription_id);
    expect(payment.amount_paid).toBe('19.99');
    expect(payment.card_last4).toBe('4242');
  });

  it('starts the billing period on the UTC day the subscription began', async () => {
    const user = await makeUser();
    const plan = await makePlan();

    const paymentId = await userRepository.subscribeToPlan(
      user.user_id,
      plan.plan_id,
      plan.price_per_month,
    );

    const [row] = await testSql`
      SELECT s.started_at, p.period_start
      FROM payment_history p
      JOIN subscriptions s ON s.subscription_id = p.subscription_id
      WHERE p.payment_id = ${paymentId}`;

    expect(utcDay(row.period_start)).toBe(utcDay(row.started_at));
  });

  it('rejects a user who already has an active subscription', async () => {
    const user = await makeUser();
    const firstPlan = await makePlan();
    const secondPlan = await makePlan();

    await userRepository.subscribeToPlan(
      user.user_id,
      firstPlan.plan_id,
      firstPlan.price_per_month,
    );

    await expect(
      userRepository.subscribeToPlan(
        user.user_id,
        secondPlan.plan_id,
        secondPlan.price_per_month,
      ),
    ).rejects.toBeInstanceOf(AlreadySubscribedError);
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

    const [original] = await testSql`
      SELECT subscription_id
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    const paymentId = await userRepository.changePlan(
      user.user_id,
      newPlan.plan_id,
      newPlan.price_per_month,
      '1234',
    );

    const [closed] = await testSql`
      SELECT ended_at
      FROM subscriptions
      WHERE subscription_id = ${original.subscription_id}`;

    expect(closed.ended_at).not.toBeNull();

    const [active] = await testSql`
      SELECT subscription_id, plan_id
      FROM subscriptions
      WHERE user_id = ${user.user_id} AND ended_at IS NULL`;

    expect(active.plan_id).toBe(newPlan.plan_id);
    expect(active.subscription_id).not.toBe(original.subscription_id);

    const [payment] = await testSql`
      SELECT subscription_id, amount_paid, card_last4
      FROM payment_history
      WHERE payment_id = ${paymentId}`;

    expect(payment.subscription_id).toBe(active.subscription_id);
    expect(payment.amount_paid).toBe('29.99');
    expect(payment.card_last4).toBe('1234');
  });

  it('keeps the old subscription row rather than replacing it', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan();
    const newPlan = await makePlan();

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

    const subscriptions = await testSql`
      SELECT ended_at
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscriptions).toHaveLength(2);
    expect(
      subscriptions.filter((row) => row.ended_at === null),
    ).toHaveLength(1);
  });

  it('leaves the current subscription active when the payment cannot be written', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan();
    const newPlan = await makePlan();

    await userRepository.subscribeToPlan(
      user.user_id,
      oldPlan.plan_id,
      oldPlan.price_per_month,
    );

    const [original] = await testSql`
      SELECT subscription_id
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    await expect(
      userRepository.changePlan(user.user_id, newPlan.plan_id, null),
    ).rejects.toThrow();

    const subscriptions = await testSql`
      SELECT subscription_id, ended_at
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].subscription_id).toBe(original.subscription_id);
    expect(subscriptions[0].ended_at).toBeNull();
  });

  it('bills again when the plan changes twice in one day', async () => {
    const user = await makeUser();
    const oldPlan = await makePlan();
    const newPlan = await makePlan();

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

    const payments = await testSql`
      SELECT p.period_start
      FROM payment_history p
      JOIN subscriptions s ON s.subscription_id = p.subscription_id
      WHERE s.user_id = ${user.user_id}`;

    expect(payments).toHaveLength(2);
    expect(utcDay(payments[0].period_start)).toBe(
      utcDay(payments[1].period_start),
    );
  });
});
