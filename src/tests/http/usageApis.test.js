import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { buildApp, tokenCookie } from './testApp.js';

describe('GET /usage/apis', () => {
  it('returns 401 without a token', async () => {
    const { app } = buildApp();

    await request(app)
      .get('/usage/apis')
      .expect(401);
  });

  it('returns API products under an apis key', async () => {
    const { app, userRepository } = buildApp();

    userRepository.findAllApiProducts.mockResolvedValue([
      {
        api_product_id: 1,
        api_name: 'geocode',
      },
    ]);

    const response = await request(app)
      .get('/usage/apis')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body).toEqual({
      apis: [
        {
          api_product_id: 1,
          api_name: 'geocode',
        },
      ],
    });
  });
});
