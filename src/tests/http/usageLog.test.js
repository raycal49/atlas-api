import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {buildApp, tokenCookie, TEST_USER_ID,} from './testApp.js';

const LIMIT = {
  DEFAULT: 25,
  REQUESTED: 10,
  MAX: 100,
  ABOVE_MAX: 999,
};

const OFFSET = {
  FIRST_PAGE: 0,
  THIRD_PAGE: 20,
};

const NO_FILTERS = {
  api: undefined,
  from: undefined,
  to: undefined,
};

describe('GET /usage/log', () => {
  it('returns 401 without a token', async () => {
    const { app } = buildApp();

    await request(app)
      .get('/usage/log')
      .expect(401);
  });

  it('uses first-page defaults when the query is empty', async () => {
    const { app, userRepository } = buildApp();

    await request(app)
      .get('/usage/log')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(userRepository.findUsageLogPage).toHaveBeenCalledWith(
      TEST_USER_ID,
      NO_FILTERS,
      LIMIT.DEFAULT,
      OFFSET.FIRST_PAGE,
    );
  });

  it('converts the requested page to an offset', async () => {
    const { app, userRepository } = buildApp();

    await request(app)
      .get('/usage/log?page=3&limit=10')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(userRepository.findUsageLogPage).toHaveBeenCalledWith(
      TEST_USER_ID,
      NO_FILTERS,
      LIMIT.REQUESTED,
      OFFSET.THIRD_PAGE,
    );
  });

  it('treats blank filters as absent', async () => {
    const { app, userRepository } = buildApp();

    await request(app)
      .get('/usage/log?api=&from=&to=')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(userRepository.findUsageLogPage).toHaveBeenCalledWith(
      TEST_USER_ID,
      NO_FILTERS,
      LIMIT.DEFAULT,
      OFFSET.FIRST_PAGE,
    );
  });

  it('forwards populated filters', async () => {
    const { app, userRepository } = buildApp();

    const filters = {
      api: 7,
      from: '2026-03-01',
      to: '2026-03-31',
    };

    await request(app)
      .get('/usage/log?api=7&from=2026-03-01&to=2026-03-31')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(userRepository.findUsageLogPage).toHaveBeenCalledWith(
      TEST_USER_ID,
      filters,
      LIMIT.DEFAULT,
      OFFSET.FIRST_PAGE,
    );
  });

  it('rejects a limit above the maximum', async () => {
    const { app, userRepository } = buildApp();

    const response = await request(app)
      .get('/usage/log?limit=999')
      .set('Cookie', await tokenCookie())
      .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: 'Validation failed',
        errors: {
          limit: [`Limit must be at most ${LIMIT.MAX}`],
        },
      });
  });

  it('caps the pager at fifty pages', async () => {
    const { app, userRepository } = buildApp();

    userRepository.findUsageLogPage.mockResolvedValue({
      calls: [],
      total: 5000,
    });

    const response = await request(app)
      .get('/usage/log?page=1&limit=25')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body.log).toMatchObject({
      total: 5000,
      page_count: 50,
      capped: true,
    });
  });

  it('returns no rows beyond the page cap', async () => {
    const { app, userRepository } = buildApp();

    userRepository.findUsageLogPage.mockResolvedValue({
      calls: [{ api_usage_id: 1 }],
      total: 5000,
    });

    const response = await request(app)
      .get('/usage/log?page=51&limit=25')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body.log).toMatchObject({
      calls: [],
      page: 51,
    });
  });

  it('reports one page when there are no calls', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get('/usage/log')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body.log).toMatchObject({
      page_count: 1,
      capped: false,
    });
  });
});
