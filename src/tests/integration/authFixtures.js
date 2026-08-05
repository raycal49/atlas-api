import { SignJWT } from 'jose';

import { jwtSecret } from '../../config/jwt.js';

export const tokenCookieFor = async (userId) => {
  const token = await new SignJWT({ id: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(jwtSecret);

  return `token=${token}`;
};
