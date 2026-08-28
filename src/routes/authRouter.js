import { Router } from 'express';
import { validateBody } from '../middleware/validationMiddleware.js';
import { registerSchema, loginSchema } from '../schemas/userSchemas.js';

export const createAuthRouter = (authController) => {
  const router = Router();
  router.post('/login', validateBody(loginSchema), authController.loginUser);
  router.post(
    '/register',
    validateBody(registerSchema),
    authController.registerUser,
  );
  router.post('/logout', authController.logoutUser);
  return router;
};
