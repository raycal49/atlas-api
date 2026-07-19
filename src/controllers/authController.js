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

      const token = await authServices.addUser(user); // will throw an error if the SQL insertion fails but... should we... error check token? no because the express 5 error-handling middleware will take care of it! i think

      console.log("In registration, token is " + token);

      res.cookie("token", token, cookieOptions);
      
      return res.status(201).json({ message: `${user.username}, your account was successfully created!`});
    },
    logoutUser: async (req, res) => {
      // options must match what login set, or the browser treats it as a different cookie and keeps the old one
      res.clearCookie("token", clearCookieOptions);

      return res.status(200).json({ message: 'Logged out' });
    }
})