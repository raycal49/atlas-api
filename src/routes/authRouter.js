import { Router } from 'express';
import { validate } from '../middleware/validationMiddleware.js';
import { registerSchema, loginSchema } from '../schemas/userSchemas.js';

export const createAuthRoutes = (authController) => {
    const router = Router();
    router.post('/login', validate(loginSchema), authController.loginUser);
    router.post('/register', validate(registerSchema), authController.registerUser);
    return router;
}; 