import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  expiredTokenCookieFor,
  tokenCookieFor,
} from '../authFixtures.js';
import { makeUser } from '../fixtures.js';
import { createTestApp } from '../testApp.js';

const app = createTestApp();

const LOGIN_PAGE = '/login.html';

const PROTECTED_PAGES = [
  ['/dashboard', 'Dashboard'],
  ['/payments', 'Billing'],
  ['/usage', 'Call log'],
];

describe.each(PROTECTED_PAGES)('GET %s', (path, heading) => {
  it('redirects a signed-out browser to the login page', async () => {
    await request(app)
      .get(path)
      .set('Accept', 'text/html')
      .expect(302)
      .expect('Location', LOGIN_PAGE);
  });

  it('redirects a browser whose session has expired', async () => {
    const user = await makeUser();

    await request(app)
      .get(path)
      .set('Accept', 'text/html')
      .set('Cookie', await expiredTokenCookieFor(user.user_id))
      .expect(302)
      .expect('Location', LOGIN_PAGE);
  });

  it('serves the page uncached to a signed-in browser', async () => {
    const user = await makeUser();

    const response = await request(app)
      .get(path)
      .set('Accept', 'text/html')
      .set('Cookie', await tokenCookieFor(user.user_id))
      .expect(200)
      .expect('Cache-Control', 'no-store');

    expect(response.text).toContain(heading);
  });
});
