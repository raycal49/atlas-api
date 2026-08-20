import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  buildApp,
  givenSubscribedUser,
  signToken,
  signedInAgent,
  tokenCookie,
  NEXT_BILL_DUE,
  PERIOD_START,
  TEST_USER_ID,
} from './testApp.js';

const GEOCODE_USAGE = {
  api_product_id: 1,
  api_name: 'geocode',
  monthly_limit: 1000,
  calls_used: 42,
};

describe('GET /data', () => {
  it('returns 401 without a token', async () => {
    const { app } = buildApp();

    await request(app)
      .get('/data')
      .expect(401);
  });

  it('redirects an unauthenticated HTML request to login', async () => {
    const { app } = buildApp();

    await request(app)
      .get('/data')
      .set('Accept', 'text/html')
      .expect(302)
      .expect('Location', '/login.html');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const { app } = buildApp();

    const forged = await signToken(
      { id: TEST_USER_ID },
      { secret: 'not-the-server-secret' },
    );

    await request(app)
      .get('/data')
      .set('Cookie', `token=${forged}`)
      .expect(401);
  });

  it('reports an expired token separately', async () => {
    const { app } = buildApp();

    const expired = await signToken(
      { id: TEST_USER_ID },
      { expSeconds: Math.floor(Date.now() / 1000) - 60 },
    );

    const response = await request(app)
      .get('/data')
      .set('Cookie', `token=${expired}`)
      .expect(401);

    expect(response.body).toBe(
      'Session expired, please log in again',
    );
  });

  it('uses the logged-in user id when login created the token', async () => {
    const { app, userRepository } = buildApp();

    const agent = await signedInAgent(app);

    await agent
      .get('/data')
      .expect(200);

    expect(
      userRepository.findActiveSubscription,
    ).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('returns null when the user has no subscription', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get('/data')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body).toEqual({
      dashboardData: null,
    });
  });

  it('returns composed dashboard data for a subscribed user', async () => {
    const { app, userRepository } = buildApp();

    givenSubscribedUser(userRepository, {
      planName: 'launch',
      pricePerMonth: '19.99',
      apis: [GEOCODE_USAGE],
    });

    const response = await request(app)
      .get('/data')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body.dashboardData).toEqual({
      plan: 'launch',
      plan_start: PERIOD_START.toISOString(),
      price: '19.99',
      bill_start: PERIOD_START.toISOString(),
      bill_due: NEXT_BILL_DUE.toISOString(),
      apis: [GEOCODE_USAGE],
    });
  });
});