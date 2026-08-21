import { SignJWT } from 'jose';

import { testJwtSecret } from './testApp.js';

const ONE_HOUR = 60 * 60;
const signTokenCookie = async (
  userId,
  {
    secret = testJwtSecret,
    expiresAt,
  } = {},
) => {
  const nowInSeconds = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({ id: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowInSeconds)
    .setExpirationTime(expiresAt ?? nowInSeconds + ONE_HOUR)
    .sign(secret);

  return `token=${token}`;
};

export const tokenCookieFor = (userId) => signTokenCookie(userId);

export const expiredTokenCookieFor = (userId) =>
  signTokenCookie(userId, {
    expiresAt: Math.floor(Date.now() / 1000) - 1,
  });

export const foreignTokenCookieFor = (userId) =>
  signTokenCookie(userId, {
    secret: new TextEncoder().encode('not-the-app-secret'),
  });
