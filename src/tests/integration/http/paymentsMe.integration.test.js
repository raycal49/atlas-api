import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tokenCookieFor } from '../authFixtures.js';
import {
  DEFAULT_PERIOD_START,
  makePayment,
  makePlan,
  makeSubscription,
  makeUser,
} from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();

const PLAN = {
  NAME: 'launch',
  PRICE: '9.99',
};

const PENDING_PLAN = {
  NAME: 'free',
  PRICE: '0.00',
};

const PLAN_START = `${DEFAULT_PERIOD_START}T00:00:00Z`;
const NEXT_BILL_DUE = '2026-04-15T00:00:00.000Z';

describe('GET /payments/me', () => {
  it('offers no upcoming charge to a user who has never subscribed', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/payments/me')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.history).toEqual({ payments: [], upcoming: null });
  });

  it('prices the upcoming charge from the plan the user is on now', async () => {
    const user = await makeUser();
    const plan = await makePlan({
      plan_name: PLAN.NAME,
      price_per_month: PLAN.PRICE,
    });

    const subscription = await makeSubscription({
      user_id: user.user_id,
      plan_id: plan.plan_id,
      started_at: PLAN_START,
    });

    await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: DEFAULT_PERIOD_START,
    });

    const response = await request(app)
      .get('/payments/me')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.history.upcoming).toEqual({
      due_on: NEXT_BILL_DUE,
      amount: PLAN.PRICE,
      plan_name: PLAN.NAME,
    });
  });

  it('prices the upcoming charge from a scheduled downgrade', async () => {
    const user = await makeUser();
    const plan = await makePlan({
      plan_name: PLAN.NAME,
      price_per_month: PLAN.PRICE,
    });

    const pendingPlan = await makePlan({
      plan_name: PENDING_PLAN.NAME,
      price_per_month: PENDING_PLAN.PRICE,
    });

    const subscription = await makeSubscription({
      user_id: user.user_id,
      plan_id: plan.plan_id,
      pending_plan_id: pendingPlan.plan_id,
      started_at: PLAN_START,
    });

    await makePayment({
      subscription_id: subscription.subscription_id,
      period_start: DEFAULT_PERIOD_START,
    });

    const response = await request(app)
      .get('/payments/me')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.history.upcoming).toEqual({
      due_on: NEXT_BILL_DUE,
      amount: PENDING_PLAN.PRICE,
      plan_name: PENDING_PLAN.NAME,
    });
  });
});
