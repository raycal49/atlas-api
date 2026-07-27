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

// A companion to the token that page JavaScript IS allowed to read. It carries
// no secret -- only the fact that somebody is signed in -- so the navbar can be
// correct on the first frame instead of asking the server and repainting.
//
// Same maxAge as the token, so the two expire together and cannot drift apart.
// If it ever does go stale the worst case is cosmetic: the navbar offers
// Dashboard, the click hits authMiddleware, and the user lands on login. Every
// protected route still verifies the real JWT; this only decides what to show.
export const hintCookieOptions = { ...cookieOptions, httpOnly: false };

export const clearHintCookieOptions = { ...clearCookieOptions, httpOnly: false };

export const SIGNED_IN_COOKIE = 'signed_in';