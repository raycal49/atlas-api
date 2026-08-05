import { SignJWT } from 'jose';

import { jwtSecret } from '../../config/jwt.js';

// Mints the same cookie authMiddleware expects, without paying for argon2.
// Real registration hashes at memoryCost 19 * 1024 (authServices.js:7), which
// is 50-100ms a call -- worth avoiding wherever auth is only a precondition
// rather than the thing under test.
//
// Claim shape must match createClaims() in services/authServices.js -- if that
// ever stops being { id }, this drifts silently and every auth test 401s.
//
// Importing jwtSecret rather than re-reading process.env is what guarantees
// this signs with the same key authMiddleware verifies with.
export const tokenCookieFor = async (userId) => {
  const token = await new SignJWT({ id: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(jwtSecret);

  return `token=${token}`;
};
