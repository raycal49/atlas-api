import {
  describe,
  expect,
  it,
} from 'vitest';

import { AlreadySubscribedError } from '../../errors/userErrors.js';
import { createUserRepository } from '../../repositories/userRepos.js';
import {
  makePlan,
  makeUser,
} from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

// the driver may hand a date column back as a Date or as 'YYYY-MM-DD'. Both
// normalise to the same UTC calendar day through this, so the assertions below
// do not depend on which one it chooses.
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

    // an unset ended_at is what "active" means here -- it is the predicate
    // one_active_subscription_per_user filters on
    expect(subscription.plan_id).toBe(plan.plan_id);
    expect(subscription.ended_at).toBeNull();

    // looking the payment up by the returned id is what proves the id is real:
    // if it were wrong or invented there would be no row to find
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

    // period_start is derived with (started_at AT TIME ZONE 'UTC')::date, so
    // the first billing period opens on the calendar day the subscription
    // began read in UTC -- not in whatever timezone the session is using
    expect(utcDay(row.period_start)).toBe(utcDay(row.started_at));
  });

  it('records no card when none is given', async () => {
    const user = await makeUser();
    const plan = await makePlan();

    const paymentId = await userRepository.subscribeToPlan(
      user.user_id,
      plan.plan_id,
      plan.price_per_month,
    );

    const [payment] = await testSql`
      SELECT card_last4
      FROM payment_history
      WHERE payment_id = ${paymentId}`;

    expect(payment.card_last4).toBeNull();
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

    // nothing in the JavaScript enforces "one subscription at a time".
    // one_active_subscription_per_user is a unique index over user_id filtered
    // to ended_at IS NULL, and the second insert collides with it.
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

    // amount_paid is NOT NULL, so a null price fails the second insert of the
    // transaction -- by which point the subscription row has already been
    // written. Without a working transaction the user would be left subscribed
    // but never billed.
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
