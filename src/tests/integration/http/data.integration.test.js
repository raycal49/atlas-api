import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { tokenCookieFor } from '../authFixtures.js';
import {
  DEFAULT_PERIOD_START,
  makeApiProduct,
  makePayment,
  makePlan,
  makePlanLimit,
  makeSubscription,
  makeUsageRows,
  makeUser,
} from '../fixtures.js';
import { createTestApp } from '../testApp.js';
import { testSql } from '../testDb.js';

const app = createTestApp();

const REGISTRATION = {
  username: 'raytester',
  email: 'ray@example.test',
  password: 'Hunter2pass',
};

const PLAN = {
  NAME: 'launch',
  PRICE: '9.99',
};

const PENDING_PLAN = {
  NAME: 'free',
  PRICE: '0.00',
};

const API_NAME = 'geocode';
const MONTHLY_LIMIT = 1000;
const CALLS_MADE = 3;

const PLAN_START = `${DEFAULT_PERIOD_START}T00:00:00Z`;
const BILL_START = `${DEFAULT_PERIOD_START}T00:00:00.000Z`;
const BILL_DUE = '2026-04-15T00:00:00.000Z';

const givenSubscribedUser = async (userId) => {
  const plan = await makePlan({
    plan_name: PLAN.NAME,
    price_per_month: PLAN.PRICE,
  });

  const apiProduct = await makeApiProduct({ api_name: API_NAME });

  await makePlanLimit({
    plan_id: plan.plan_id,
    api_product_id: apiProduct.api_product_id,
    monthly_limit: MONTHLY_LIMIT,
  });

  const subscription = await makeSubscription({
    user_id: userId,
    plan_id: plan.plan_id,
    started_at: PLAN_START,
  });

  await makePayment({
    subscription_id: subscription.subscription_id,
    period_start: DEFAULT_PERIOD_START,
  });

  return { plan, apiProduct };
};

describe('GET /data', () => {
  it('returns null for a user who has no subscription', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body).toEqual({ dashboardData: null });
  });

  it('composes the plan, the billing period and the api calls', async () => {
    const user = await makeUser();
    const { apiProduct } = await givenSubscribedUser(user.user_id);

    await makeUsageRows(CALLS_MADE, {
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.dashboardData).toEqual({
      plan: PLAN.NAME,
      pending_plan: null,
      plan_start: BILL_START,
      price: PLAN.PRICE,
      bill_start: BILL_START,
      bill_due: BILL_DUE,
      apis: [
        {
          api_product_id: apiProduct.api_product_id,
          api_name: API_NAME,
          monthly_limit: MONTHLY_LIMIT,
          calls_used: CALLS_MADE,
        },
      ],
    });
  });

  it('names a scheduled plan change without moving the current plan', async () => {
    const user = await makeUser();
    await givenSubscribedUser(user.user_id);

    const pendingPlan = await makePlan({
      plan_name: PENDING_PLAN.NAME,
      price_per_month: PENDING_PLAN.PRICE,
    });

    await testSql`
      UPDATE subscriptions
      SET pending_plan_id = ${pendingPlan.plan_id}
      WHERE user_id = ${user.user_id} AND ended_at IS NULL`;

    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    const { plan, price, pending_plan } = response.body.dashboardData;

    expect({ plan, price, pending_plan }).toEqual({
      plan: PLAN.NAME,
      price: PLAN.PRICE,
      pending_plan: PENDING_PLAN.NAME,
    });
  });

  it('reads the dashboard of the user the registration token names', async () => {
    await makePlan({ plan_name: PLAN.NAME, price_per_month: PLAN.PRICE });
    await makePlan({ plan_name: 'scale', price_per_month: '19.99' });

    const agent = request.agent(app);
    await agent.post('/auth/register').send(REGISTRATION).expect(201);
    await agent.post('/subscriptions')
      .send({ plan_name: PLAN.NAME, card_number: '4111111111111111' })
      .expect(201);

    const bystander = request.agent(app);
    await bystander.post('/auth/register').send({
      username: 'othertester',
      email: 'other@example.test',
      password: 'Hunter2pass',
    }).expect(201);
    await bystander.post('/subscriptions')
      .send({ plan_name: 'scale', card_number: '4111111111111111' })
      .expect(201);

    const response = await agent
      .get('/data')
      .set('Accept', 'application/json')
      .expect(200);

    expect(response.body.dashboardData.plan).toBe(PLAN.NAME);
  });
});
