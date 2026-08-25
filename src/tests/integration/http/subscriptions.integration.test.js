import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { tokenCookieFor } from '../authFixtures.js';
import { makePlan, makeUser } from '../fixtures.js';
import { createTestApp } from '../testApp.js';
import { testSql } from '../testDb.js';

const app = createTestApp();

const CARD = {
  NUMBER: '4111111111111111',
  LAST_FOUR: '1111',
};

const PLAN_PRICE = '19.99';

describe('POST /subscriptions', () => {
  it('rejects a card number that is not a card number', async () => {
    const user = await makeUser();
    const plan = await makePlan();

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({ plan_name: plan.plan_name, card_number: 'not-a-card' })
      .expect(400);

    expect(response.body).toEqual({
      status: 'fail',
      message: 'Validation failed',
      errors: {
        card_number: ['Card number must be 13-19 digits'],
      },
    });
  });

  it('creates the subscription and stores only the last four card digits', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: PLAN_PRICE });

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({ plan_name: plan.plan_name, card_number: CARD.NUMBER })
      .expect(201);

    const [subscription] = await testSql`
      SELECT subscription_id, plan_id, ended_at
      FROM subscriptions
      WHERE user_id = ${user.user_id}`;

    expect(subscription.plan_id).toBe(plan.plan_id);
    expect(subscription.ended_at).toBeNull();

    const [payment] = await testSql`
      SELECT subscription_id, amount_paid, card_last4
      FROM payment_history
      WHERE payment_id = ${response.body.paymentId}`;

    expect(payment.subscription_id).toBe(subscription.subscription_id);
    expect(payment.amount_paid).toBe(PLAN_PRICE);
    expect(payment.card_last4).toBe(CARD.LAST_FOUR);
  });

  it('rejects a plan name no active plan carries', async () => {
    const user = await makeUser();

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({ plan_name: 'no-such-plan', card_number: CARD.NUMBER })
      .expect(400);

    expect(response.body).toBe("No active plan named 'no-such-plan'");
  });
<<<<<<< Updated upstream
=======

  it('subscribes to a free plan without a card', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: FREE_PRICE });

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({ plan_name: plan.plan_name })
      .expect(201);

    const [payment] = await testSql`
      SELECT amount_paid, card_last4
      FROM payment_history
      WHERE payment_id = ${response.body.paymentId}`;

    expect(payment.amount_paid).toBe(FREE_PRICE);
    expect(payment.card_last4).toBeNull();
  });

  it('rejects a paid plan when no card is supplied', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: PLAN_PRICE });

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({ plan_name: plan.plan_name })
      .expect(400);

    expect(response.body).toBe('Card number is required for paid plans');
  });

  it('schedules a move to a cheaper plan without billing for it', async () => {
    const user = await makeUser();
    const cookie = await tokenCookieFor(user.user_id);
    const paidPlan = await makePlan({ price_per_month: PLAN_PRICE });
    const freePlan = await makePlan({ price_per_month: FREE_PRICE });

    await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ plan_name: paidPlan.plan_name, card_number: CARD.NUMBER })
      .expect(201);

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ plan_name: freePlan.plan_name })
      .expect(200);

    expect(response.body).toEqual({ scheduled: freePlan.plan_name });

    const payments = await testSql`
      SELECT ph.payment_id
      FROM payment_history ph
      JOIN subscriptions s ON s.subscription_id = ph.subscription_id
      WHERE s.user_id = ${user.user_id}`;

    expect(payments).toHaveLength(1);

    const [active] = await testSql`
      SELECT plan_id FROM subscriptions
      WHERE user_id = ${user.user_id} AND ended_at IS NULL`;

    expect(active.plan_id).toBe(paidPlan.plan_id);
  });
>>>>>>> Stashed changes
});
