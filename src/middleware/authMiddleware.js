import { jwtVerify } from 'jose';
import { JWTExpired } from 'jose/errors';
import { InvalidTokenError, ExpiredTokenError } from '../errors/authErrors.js';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export const createAuthMiddleware = () => {
  return async (req, res, next) => {
    const token = req.cookies?.token;

    if (!token)
        return res.status(401).json({ error: 'no token' });

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