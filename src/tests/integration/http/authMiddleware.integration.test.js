import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  expiredTokenCookieFor,
  foreignTokenCookieFor,
} from '../authFixtures.js';
import { makeUser } from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();
const PROTECTED_ROUTE = '/data';

describe('authMiddleware', () => {
  it('rejects a request that carries no token cookie', async () => {
    const response = await request(app)
      .get(PROTECTED_ROUTE)
      .set('Accept', 'application/json')
      .expect(401);

    expect(response.body).toBe('Not logged in');
  });

  it('redirects an unauthenticated browser navigation to login', async () => {
    await request(app)
      .get(PROTECTED_ROUTE)
      .set('Accept', 'text/html')
      .expect(302)
      .expect('Location', '/login.html');
  });

  it('rejects a token signed with a key the app does not hold', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get(PROTECTED_ROUTE)
      .set('Accept', 'application/json')
      .set('Cookie', await foreignTokenCookieFor(user.user_id))
      .expect(401);

    expect(response.body).toBe('Invalid authentication token');
  });

  it('reports an expired session separately from a forged token', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get(PROTECTED_ROUTE)
      .set('Accept', 'application/json')
      .set('Cookie', await expiredTokenCookieFor(user.user_id))
      .expect(401);

    expect(response.body).toBe('Session expired, please log in again');
  });
});
