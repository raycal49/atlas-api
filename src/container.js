import path from 'node:path';

import { createUserRepository } from './repositories/userRepository.js';
import { createUserService } from './services/userService.js';
import { createUserController } from './controllers/userController.js';
import { createUserRouter } from './routes/userRouter.js';

import { createAuthRepository } from './repositories/authRepository.js';
import { createAuthService } from './services/authService.js';
import { createAuthController } from './controllers/authController.js';
import { createAuthMiddleware } from './middleware/authMiddleware.js';
import { createAuthRouter } from './routes/authRouter.js';

import { createPageRouter } from './routes/pageRouter.js';
import { createErrorMiddleware } from './middleware/errorMiddleware.js';

export const createContainer = ({ sql, jwtSecret }) => {
  const authRepo = createAuthRepository(sql);
  const authServices = createAuthService(authRepo, jwtSecret);
  const authController = createAuthController(authServices);
  const authMiddleware = createAuthMiddleware(jwtSecret);
  const authRouter = createAuthRouter(authController);

  const userRepo = createUserRepository(sql);
  const userServices = createUserService(userRepo);
  const userController = createUserController(userServices);
  const userRouter = createUserRouter(userController, authMiddleware);

  const viewsDir = path.join(import.meta.dirname, 'views');
  const publicDir = path.join(import.meta.dirname, 'public');

  const pageRouter = createPageRouter({ authMiddleware, viewsDir });
  const errorHandler = createErrorMiddleware();

  return {
    sql,
    publicDir,
    authRouter,
    userRouter,
    pageRouter,
    errorHandler,
    close: async () => {
      await sql.end();
    },
  };
};