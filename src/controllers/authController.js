import {
  cookieOptions,
  clearCookieOptions,
  hintCookieOptions,
  clearHintCookieOptions,
  SIGNED_IN_COOKIE,
} from '../config/cookies.js';

export const createAuthController = (authServices) => ({
    loginUser: async (req, res) => {
      const token = await authServices.authenticateUser(req.body.username, req.body.password);

      res.cookie("token", token, cookieOptions);
      res.cookie(SIGNED_IN_COOKIE, "1", hintCookieOptions);

      return res.status(200).json({ message: 'Logged in' });
    },
    registerUser: async (req, res) => {
      const user = req.body;

      const token = await authServices.addUser(user);

      res.cookie("token", token, cookieOptions);
      res.cookie(SIGNED_IN_COOKIE, "1", hintCookieOptions);

      return res.status(201).json({ message: `${user.username}, your account was successfully created!`});
    },
    logoutUser: async (req, res) => {
      res.clearCookie("token", clearCookieOptions);
      res.clearCookie(SIGNED_IN_COOKIE, clearHintCookieOptions);

      return res.redirect('/login.html');
    },
})
