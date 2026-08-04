import { describe, expect, it, } from 'vitest';
import { AlreadySubscribedError } from '../../errors/userErrors.js';
import { createUserRepository } from '../../repositories/userRepos.js';
import { makePlan, makeUser, } from './fixtures.js';
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

    // the charge belongs to the new subscription and is at the new price
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

    // two rows for one user coexist without tripping
    // one_active_subscription_per_user, because that index only covers rows
    // where ended_at IS NULL and the UPDATE clears that first, inside the same
    // transaction. The old row has to survive: findPaymentHistory reaches older
    // payments by joining through it, so deleting it would erase billing history
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

    // amount_paid is NOT NULL, so the payment insert fails after the UPDATE has
    // already closed the old subscription and the new row has been written.
    // Without a working transaction the user would end up with no active
    // subscription at all -- silently unsubscribed by a failed plan change
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

    // KNOWN QUIRK: payment_once_per_period is unique on
    // (subscription_id, period_start), and every change mints a new
    // subscription_id, so the constraint cannot see that this is the same user
    // on the same day. Two charges land. Pinned as-is.
    expect(payments).toHaveLength(2);
    expect(utcDay(payments[0].period_start)).toBe(
      utcDay(payments[1].period_start),
    );
  });
});
