const isProd = process.env.NODE_ENV === 'production';

export const cookieOptions = {
  httpOnly: true,                 // not readable by JS — mitigates XSS token theft
  secure: isProd,                 // HTTPS-only in prod, off for http://localhost
  sameSite: 'strict',             // CSRF defense
  path: '/',
  maxAge: 60 * 60 * 1000 //1 hour
};

// Used by logout so it always matches what login set
export const clearCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/'
};