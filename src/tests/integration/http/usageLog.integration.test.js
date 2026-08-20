import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { tokenCookieFor } from '../authFixtures.js';
import {
  makeApiProduct,
  makeUsage,
  makeUsageRows,
  makeUser,
} from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();

const LIMIT = {
  DEFAULT: 25,
  MAX: 100,
  ABOVE_MAX: 999,
};

const MAX_PAGES = 50;

const OVER_CAP_ROWS = LIMIT.DEFAULT * MAX_PAGES + 1;

const DEFAULT_PAGE_ROWS = LIMIT.DEFAULT + 1;

const CALLED_AT = {
  NEWEST: '2026-03-15T12:00:02Z',
  MIDDLE: '2026-03-15T12:00:01Z',
  OLDEST: '2026-03-15T12:00:00Z',
};

describe('GET /usage/log', () => {
  it('rejects a request that carries no token cookie', async () => {
    await request(app)
      .get('/usage/log')
      .expect(401);
  });

  it('names the rule a rejected limit broke', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get(`/usage/log?limit=${LIMIT.ABOVE_MAX}`)
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(400);

    expect(response.body).toEqual({
      status: 'fail',
      message: 'Validation failed',
      errors: {
        limit: [`Limit must be at most ${LIMIT.MAX}`],
      },
    });
  });

  it('serves the default page size when the query is empty', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsageRows(DEFAULT_PAGE_ROWS, {
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get('/usage/log')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log.calls).toHaveLength(LIMIT.DEFAULT);
    expect(response.body.log).toMatchObject({
      total: DEFAULT_PAGE_ROWS,
      page: 1,
      page_count: 2,
      capped: false,
    });
  });

  it('walks to the requested page', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    for (const used_at of Object.values(CALLED_AT)) {
      await makeUsage({
        user_id: user.user_id,
        api_product_id: apiProduct.api_product_id,
        used_at,
      });
    }

    const response = await request(app)
      .get('/usage/log?page=2&limit=1')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log.calls).toHaveLength(1);
    expect(response.body.log.calls[0].used_at)
      .toBe(new Date(CALLED_AT.MIDDLE).toISOString());
  });

  it('treats blank filters as absent', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get('/usage/log?api=&from=&to=')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log.calls).toHaveLength(1);
    expect(response.body.log.total).toBe(1);
  });

  it('narrows the log to one api product', async () => {
    const user = await makeUser();
    const geocode = await makeApiProduct({ api_name: 'geocode' });
    const routing = await makeApiProduct({ api_name: 'routing' });

    await makeUsage({
      user_id: user.user_id,
      api_product_id: geocode.api_product_id,
    });
    await makeUsage({
      user_id: user.user_id,
      api_product_id: routing.api_product_id,
    });

    const response = await request(app)
      .get(`/usage/log?api=${geocode.api_product_id}`)
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log.calls.map((call) => call.api_name))
      .toEqual(['geocode']);
    expect(response.body.log.total).toBe(1);
  });

  it('shows another user nothing of this one', async () => {
    const user = await makeUser();
    const bystander = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsage({
      user_id: bystander.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get('/usage/log')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log).toMatchObject({ calls: [], total: 0 });
  });

  it('stops the pager at fifty pages and says why', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsageRows(OVER_CAP_ROWS, {
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get('/usage/log')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log).toMatchObject({
      total: OVER_CAP_ROWS,
      page_count: MAX_PAGES,
      capped: true,
    });
  });

  it('serves no rows past the page cap', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsageRows(OVER_CAP_ROWS, {
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get(`/usage/log?page=${MAX_PAGES + 1}`)
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log).toMatchObject({
      calls: [],
      page: MAX_PAGES + 1,
    });
  });

  it('reports one page when there are no calls', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/usage/log')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log).toMatchObject({
      calls: [],
      total: 0,
      page_count: 1,
      capped: false,
    });
  });
});
