import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  expiredTokenCookieFor,
  foreignTokenCookieFor,
  tokenCookieFor,
} from '../authFixtures.js';
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
  it('rejects a request that carries no token cookie', async () => {
    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json')
      .expect(401);

    expect(response.body).toBe('Not logged in');
  });

  it('redirects an unauthenticated browser navigation to login', async () => {
    await request(app)
      .get('/data')
      .set('Accept', 'text/html')
      .expect(302)
      .expect('Location', '/login.html');
  });

  it('rejects a token signed with a key the app does not hold', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json')
      .set('Cookie', await foreignTokenCookieFor(user.user_id))
      .expect(401);

    expect(response.body).toBe('Invalid authentication token');
  });

  it('reports an expired session separately from a forged token', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json')
      .set('Cookie', await expiredTokenCookieFor(user.user_id))
      .expect(401);

    expect(response.body).toBe('Session expired, please log in again');
  });

  it('returns null for a user who has no subscription', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/data')
      .set('Accept', 'application/json')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body).toEqual({ dashboardData: null });
  });

  it('composes the plan, the billing period and the metered calls', async () => {
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

  it('reads the dashboard of the user the registration token names', async () => {
    const agent = request.agent(app);

    await agent
      .post('/auth/register')
      .send(REGISTRATION)
      .expect(201);

    const [registered] = await testSql`
      SELECT user_id FROM users WHERE username = ${REGISTRATION.username}`;

    await givenSubscribedUser(registered.user_id);

    const bystander = await makeUser();
    const otherPlan = await makePlan({
      plan_name: 'scale',
      price_per_month: '19.99',
    });
    const otherSubscription = await makeSubscription({
      user_id: bystander.user_id,
      plan_id: otherPlan.plan_id,
      started_at: PLAN_START,
    });
    await makePayment({
      subscription_id: otherSubscription.subscription_id,
      period_start: DEFAULT_PERIOD_START,
    });

    const response = await agent
      .get('/data')
      .set('Accept', 'application/json')
      .expect(200);

    expect(response.body.dashboardData.plan).toBe(PLAN.NAME);
  });
});
