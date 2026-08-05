import { SignJWT } from 'jose';

import { testJwtSecret } from './testApp.js';

export const tokenCookieFor = async (userId) => {
  const token = await new SignJWT({ id: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(testJwtSecret);

  return `token=${token}`;
};
