import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { makePlan } from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();

describe('GET /plans', () => {
  it('is readable without a token', async () => {
    await request(app).get('/plans').expect(200);
  });

  it('returns only active plans, cheapest first', async () => {
    await makePlan({ plan_name: 'scale', price_per_month: '19.99' });
    await makePlan({ plan_name: 'launch', price_per_month: '4.99' });
    await makePlan({
      plan_name: 'retired',
      price_per_month: '1.99',
      is_active: false,
    });

    const response = await request(app).get('/plans').expect(200);

    expect(response.body.plans.map((plan) => plan.plan_name)).toEqual([
      'launch',
      'scale',
    ]);
  });
});
