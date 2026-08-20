import { SignJWT } from 'jose';

import { testJwtSecret } from './testApp.js';

const ONE_HOUR = 60 * 60;

// A token the app rejects is the app's own token with exactly one thing
// changed -- the key it was signed with, or the moment it expires. Building
// them all from one signer keeps that difference the only thing a test has to
// read, and keeps the valid cookie honest: it goes through the same code path
// as the ones that are meant to fail.
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

// Already expired when it is handed over, so the test never waits. jose
// rejects it with JWTExpired, which authMiddleware turns into the 401 that
// says the session ended rather than the one that says the token was forged.
export const expiredTokenCookieFor = (userId) =>
  signTokenCookie(userId, {
    expiresAt: Math.floor(Date.now() / 1000) - 1,
  });

// Well-formed, unexpired, and signed with a key the app does not hold -- the
// shape a forged token takes.
export const foreignTokenCookieFor = (userId) =>
  signTokenCookie(userId, {
    secret: new TextEncoder().encode('not-the-app-secret'),
  });
