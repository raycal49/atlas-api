import path from 'node:path';

import { createUserRepository } from './repositories/userRepos.js';
import { createUserServices } from './services/userServices.js';
import { createUserController } from './controllers/userController.js';
import { createUserRoutes } from './routes/userRouter.js';

import { createAuthRepository } from './repositories/authRepo.js';
import { createAuthServices } from './services/authServices.js';
import { createAuthController } from './controllers/authController.js';
import { createAuthMiddleware } from './middleware/authMiddleware.js';
import { createAuthRoutes } from './routes/authRouter.js';

import { createPageRoutes } from './routes/pageRouter.js';
import { createErrorHandler } from './middleware/errorMiddleware.js';

export const createContainer = ({ sql }) => {
  const authRepo = createAuthRepository(sql);
  const authServices = createAuthServices(authRepo);
  const authController = createAuthController(authServices);
  const authMiddleware = createAuthMiddleware();
  const authRoutes = createAuthRoutes(authController);

  const userRepo = createUserRepository(sql);
  const userServices = createUserServices(userRepo);
  const userController = createUserController(userServices);
  const userRoutes = createUserRoutes(userController, authMiddleware);

  const viewsDir = path.join(import.meta.dirname, 'views');
  const publicDir = path.join(import.meta.dirname, 'public');

  const pageRoutes = createPageRoutes({ authMiddleware, viewsDir });
  const errorHandler = createErrorHandler();

  return {
    sql,
    publicDir,
    authRoutes,
    userRoutes,
    pageRoutes,
    errorHandler,
    close: async () => {
      await sql.end();
    },
  };
};