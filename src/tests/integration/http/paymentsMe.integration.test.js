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

const ENDED_PLAN_PRICE = '4.99';

const PLAN_START = `${DEFAULT_PERIOD_START}T00:00:00Z`;
const NEXT_BILL_DUE = '2026-04-15T00:00:00.000Z';

describe('GET /payments/me', () => {
  it('rejects a request that carries no token cookie', async () => {
    await request(app)
      .get('/payments/me')
      .expect(401);
  });

  it('offers no upcoming charge to a user whose subscription has ended', async () => {
    const user = await makeUser();
    const plan = await makePlan({ price_per_month: ENDED_PLAN_PRICE });

    const subscription = await makeSubscription({
      user_id: user.user_id,
      plan_id: plan.plan_id,
      started_at: PLAN_START,
      ended_at: PLAN_START,
    });

    await makePayment({
      subscription_id: subscription.subscription_id,
      amount_paid: ENDED_PLAN_PRICE,
    });

    const response = await request(app)
      .get('/payments/me')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.history.payments).toHaveLength(1);
    expect(response.body.history.upcoming).toBeNull();
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

  it('returns the caller their own payments and nobody else', async () => {
    const plan = await makePlan({ price_per_month: PLAN.PRICE });

    const subscribe = async (userId, amountPaid) => {
      const subscription = await makeSubscription({
        user_id: userId,
        plan_id: plan.plan_id,
        started_at: PLAN_START,
      });

      await makePayment({
        subscription_id: subscription.subscription_id,
        amount_paid: amountPaid,
        period_start: DEFAULT_PERIOD_START,
      });
    };

    const caller = await makeUser();
    const bystander = await makeUser();

    await subscribe(caller.user_id, '9.99');
    await subscribe(bystander.user_id, '19.99');

    const response = await request(app)
      .get('/payments/me')
      .set('Cookie', await tokenCookieFor(caller.user_id))
      .expect(200);

    expect(response.body.history.payments.map((payment) => payment.amount_paid))
      .toEqual(['9.99']);
  });
});
