import { jwtVerify } from 'jose';
import { JWTExpired } from 'jose/errors';
import { InvalidTokenError, ExpiredTokenError, MissingTokenError } from '../errors/authErrors.js';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export const createAuthMiddleware = () => {
  return async (req, res, next) => {
    const token = req.cookies?.token;

    // throw (don't respond directly) so ALL auth failures funnel through the
    // error middleware, where the browser-vs-fetch presentation is decided
    if (!token)
        throw new MissingTokenError();

    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      req.tokenInfo = payload;
    } catch (err) {
      if (err instanceof JWTExpired)
        throw new ExpiredTokenError({ cause: err });
      throw new InvalidTokenError({ cause: err });
    }

    next();
  };
};