import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { tokenCookieFor } from '../authFixtures.js';
import { makeApiProduct, makeUser } from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();

describe('GET /usage/apis', () => {
  it('rejects a request that carries no token cookie', async () => {
    await request(app)
      .get('/usage/apis')
      .expect(401);
  });

  it('returns every api product under an apis key', async () => {
    const user = await makeUser();
    const routing = await makeApiProduct({ api_name: 'routing' });
    const geocode = await makeApiProduct({ api_name: 'geocode' });

    const response = await request(app)
      .get('/usage/apis')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200);

    expect(response.body).toEqual({
      apis: [
        { api_product_id: geocode.api_product_id, api_name: 'geocode' },
        { api_product_id: routing.api_product_id, api_name: 'routing' },
      ],
    });
  });
});
