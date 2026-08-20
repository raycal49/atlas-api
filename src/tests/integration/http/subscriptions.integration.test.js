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
});
