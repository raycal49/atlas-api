import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { PAGE_SIZE } from '../../../repositories/userRepository.js';
import { tokenCookieFor } from '../authFixtures.js';
import {
  makeApiProduct,
  makeUsage,
  makeUsageRows,
  makeUser,
  secondsApart,
} from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();

const cursorQuery = (cursor) =>
  new URLSearchParams({ cursor_at: cursor.at, cursor_id: cursor.id });

describe('GET /usage/log', () => {
  it('grabs a page after the initial page', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    for (let i = 0; i < PAGE_SIZE + 1; i += 1) {
      await makeUsage({
        user_id: user.user_id,
        api_product_id: apiProduct.api_product_id,
        used_at: secondsApart(i),
      });
    }

    const cookie = await tokenCookieFor(user.user_id);

    const firstPage = await request(app)
      .get('/usage/log')
      .set('Cookie', cookie)
      .expect(200);

    const secondPage = await request(app)
      .get(`/usage/log?${cursorQuery(firstPage.body.log.next_cursor)}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(secondPage.body.log.calls.length).toBeGreaterThan(0);
    expect(secondPage.body.log.calls).not.toEqual(firstPage.body.log.calls);
  });

  it('doesnt create a cursor page if exactly 25 logs', async () => {
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
      .get(`/usage/log?api_product_id=${geocode.api_product_id}`)
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body.log.calls.map((call) => call.api_name)).toEqual([
      'geocode',
    ]);
  });
});
