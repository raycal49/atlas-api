import { jwtVerify } from 'jose';
import { JWTExpired } from 'jose/errors';
import { InvalidTokenError, ExpiredTokenError, MissingTokenError } from '../errors/authErrors.js';

export const createAuthMiddleware = (jwtSecret) => {
  return async (req, res, next) => {
    const token = req.cookies?.token;

    if (!token)
        throw new MissingTokenError();

    try {
      const { payload } = await jwtVerify(token, jwtSecret, { algorithms: ['HS256'] });
      req.tokenInfo = payload;
    } catch (err) {
      if (err instanceof JWTExpired)
        throw new ExpiredTokenError({ cause: err });
      throw new InvalidTokenError({ cause: err });
    }

    next();
  };
};