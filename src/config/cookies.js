const isProd = process.env.NODE_ENV === 'production';

export const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/',
  maxAge: 60 * 60 * 1000,
};

export const clearCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/',
};

export const hintCookieOptions = { ...cookieOptions, httpOnly: false };

export const clearHintCookieOptions = {
  ...clearCookieOptions,
  httpOnly: false,
};

export const SIGNED_IN_COOKIE = 'signed_in';
export const TOKEN_COOKIE = 'token';
