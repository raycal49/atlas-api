import { cookieOptions, clearCookieOptions } from '../config/cookies.js';

export const createAuthController = (authServices) => ({
    loginUser: async (req, res) => {
      const token = await authServices.authenticateUser(req.body.username, req.body.password);
      console.log("In login, token is " + token);

      res.cookie("token", token, cookieOptions);

      return res.status(200).json({ message: 'Logged in' });
    },
    registerUser: async (req, res) => {
      const user = req.body;

      const token = await authServices.addUser(user);

      console.log("In registration, token is " + token);

      res.cookie("token", token, cookieOptions);
      
      return res.status(201).json({ message: `${user.username}, your account was successfully created!`});
    },
    logoutUser: async (req, res) => {
      res.clearCookie("token", clearCookieOptions);

      return res.status(200).json({ message: 'Logged out' });
    }
})