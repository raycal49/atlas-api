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

const PAGE_SIZE = 25;
const OVER_A_PAGE = PAGE_SIZE + 1;

const secondsApart = (index) =>
  new Date(Date.UTC(2026, 2, 15, 12, 0, index)).toISOString();

const cursorQuery = (cursor) =>
  new URLSearchParams({ cursor_at: cursor.at, cursor_id: cursor.id });

describe('GET /usage/log', () => {
  it('serves the default page size when the query is empty', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsageRows(OVER_A_PAGE, {
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const cookie = await tokenCookieFor(user.user_id);

    const first = await request(app)
      .get('/usage/log')
      .set('Cookie', cookie)
      .expect(200);

    expect(first.body.log.calls).toHaveLength(PAGE_SIZE);
    expect(first.body.log.next_cursor).not.toBeNull();

    const second = await request(app)
      .get(`/usage/log?${cursorQuery(first.body.log.next_cursor)}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(second.body.log.calls).toHaveLength(1);
    expect(second.body.log.next_cursor).toBeNull();

    const ids = [...first.body.log.calls, ...second.body.log.calls]
      .map((call) => call.api_usage_id);

    expect(new Set(ids).size).toBe(OVER_A_PAGE);
  });

  it('walks to the next page with the cursor it was handed', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    for (let i = 0; i < OVER_A_PAGE; i += 1) {
      await makeUsage({
        user_id: user.user_id,
        api_product_id: apiProduct.api_product_id,
        used_at: secondsApart(i),
      });
    }

    const cookie = await tokenCookieFor(user.user_id);

    const first = await request(app)
      .get('/usage/log')
      .set('Cookie', cookie)
      .expect(200);

    const second = await request(app)
      .get(`/usage/log?${cursorQuery(first.body.log.next_cursor)}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(second.body.log.calls).toHaveLength(1);
    expect(second.body.log.calls[0].used_at)
      .toBe(new Date(secondsApart(0)).toISOString());
    expect(second.body.log.next_cursor).toBeNull();

    const firstIds = first.body.log.calls.map((call) => call.api_usage_id);
    expect(firstIds).not.toContain(second.body.log.calls[0].api_usage_id);
  });

  it('ends the walk on a full final page', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsageRows(PAGE_SIZE, {
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get('/usage/log')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log.calls).toHaveLength(PAGE_SIZE);
    expect(response.body.log.next_cursor).toBeNull();
  });

  it('treats blank filters and a blank cursor as absent', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const response = await request(app)
      .get('/usage/log?api=&from=&to=&cursor_at=&cursor_id=')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log.calls).toHaveLength(1);
    expect(response.body.log.next_cursor).toBeNull();
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
  });

  it('refuses half a cursor', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/usage/log?cursor_at=2026-03-15T12%3A00%3A00.000Z')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(400);

    expect(response.body).toEqual({
      status: 'fail',
      message: 'Validation failed',
      errors: {
        cursor_at: ['Cursor time and cursor id must be sent together'],
      },
    });
  });

  it('names the rule a non-numeric cursor id broke', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/usage/log?cursor_at=2026-03-15T12%3A00%3A00.000Z&cursor_id=abc')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(400);

    expect(response.body.errors).toEqual({
      cursor_id: ['Cursor id must be digits'],
    });
  });

  it('rejects a stale page param as an unrecognized key', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/usage/log?page=2')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(400);

    expect(response.body.errors).toEqual({
      root: ['Unrecognized key: "page"'],
    });
  });

  it('rejects a caller trying to choose its own page size', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get('/usage/log?limit=50')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(400);

    expect(response.body.errors).toEqual({
      root: ['Unrecognized key: "limit"'],
    });
  });
});
