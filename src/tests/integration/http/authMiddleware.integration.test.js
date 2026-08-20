import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  expiredTokenCookieFor,
  foreignTokenCookieFor,
} from '../authFixtures.js';
import { makeUser } from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();

// Every protected route is guarded by the same middleware, so these cases are
// about the guard rather than about any one route. /data is only the vehicle:
// it is protected, and it needs no fixtures to reach the 401.
//
// The success path is deliberately absent. Every other file in this folder
// sends a valid cookie and gets a 200, so a middleware that stopped setting
// req.tokenInfo would fail those tests loudly rather than quietly pass here.
const PROTECTED_ROUTE = '/data';

describe('authMiddleware', () => {
  it('rejects a request that carries no token cookie', async () => {
    const response = await request(app)
      .get(PROTECTED_ROUTE)
      .set('Accept', 'application/json')
      .expect(401);

    expect(response.body).toBe('Not logged in');
  });

  // A browser navigating to a protected page should land on the login form,
  // not on a JSON error it cannot render. The Accept header is the only thing
  // separating the two, and errorMiddleware is what acts on it.
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

  // An expired session and a forged token are both 401, but only one of them
  // is worth telling the user to log in again about.
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
