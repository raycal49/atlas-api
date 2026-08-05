import {
  describe,
  expect,
  it,
} from 'vitest';
import request from 'supertest';

import { tokenCookieFor } from './authFixtures.js';
import { makePlan, makeUser } from './fixtures.js';
import { createTestApp } from './testApp.js';
import { testSql } from './testDb.js';

const app = createTestApp();

describe('GET /plans', () => {
  it('returns only active plans, cheapest first', async () => {
    await makePlan({ plan_name: 'scale', price_per_month: '19.99' });
    await makePlan({ plan_name: 'launch', price_per_month: '4.99' });
    await makePlan({
      plan_name: 'retired',
      price_per_month: '1.99',
      is_active: false,
    });

    const response = await request(app).get('/plans');

    expect(response.status).toBe(200);
    expect(response.body.plans.map((plan) => plan.plan_name)).toEqual([
      'launch',
      'scale',
    ]);
  });
});

describe('GET /data', () => {
  it('rejects a request that carries no token cookie', async () => {
    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
    expect(response.body).toBe('Not logged in');
  });
});

describe('POST /subscriptions', () => {
  it('creates the subscription and stores only the last four card digits', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: '19.99' });

    const response = await request(app)
      .post('/subscriptions')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .send({
        plan_name: plan.plan_name,
        card_number: '4111111111111111',
      });

    expect(response.status).toBe(201);

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
    expect(payment.amount_paid).toBe('19.99');
    expect(payment.card_last4).toBe('1111');
  });
});
