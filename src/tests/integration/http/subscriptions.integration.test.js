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
  it('creates a subscription and stores only the last four card digits', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: PLAN_PRICE });

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({ plan_name: plan.plan_name, card_number: CARD.NUMBER })
      .expect(201);

    const [payment] = await testSql`
      SELECT card_last4
      FROM payment_history
      WHERE payment_id = ${response.body.subscription.payment_id}`;

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

  it('subscribes to a free plan without a card', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: '0' });

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({ plan_name: plan.plan_name })
      .expect(201);

    const [payment] = await testSql`
      SELECT amount_paid, card_last4
      FROM payment_history
      WHERE payment_id = ${response.body.subscription.payment_id}`;

    expect(payment.amount_paid).toBe('0');
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
    const freePlan = await makePlan({ price_per_month: '0' });

    await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ plan_name: paidPlan.plan_name, card_number: CARD.NUMBER })
      .expect(201);

    await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ plan_name: freePlan.plan_name })
      .expect(200);

    const [subscription] = await testSql`
      SELECT s.plan_id, s.pending_plan_id, count(ph.payment_id)::int AS payments
      FROM subscriptions s
      JOIN payment_history ph ON ph.subscription_id = s.subscription_id
      WHERE s.user_id = ${user.user_id} AND s.ended_at IS NULL
      GROUP BY s.subscription_id`;

    expect(subscription).toEqual({
      plan_id: paidPlan.plan_id,
      pending_plan_id: freePlan.plan_id,
      payments: 1,
    });
  });

  it('rejects rescheduling a plan that is already scheduled', async () => {
    const user = await makeUser();
    const cookie = await tokenCookieFor(user.user_id);
    const paidPlan = await makePlan({ price_per_month: PLAN_PRICE });
    const freePlan = await makePlan({ price_per_month: '0' });

    await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ plan_name: paidPlan.plan_name, card_number: CARD.NUMBER })
      .expect(201);

    await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ plan_name: freePlan.plan_name })
      .expect(200);

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', cookie)
      .send({ plan_name: freePlan.plan_name })
      .expect(409);

    expect(response.body).toBe('This plan is already scheduled');
  });
});
