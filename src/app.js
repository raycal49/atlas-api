import express from 'express';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import { createDb } from './database/db.js';

// import { createUserRepository } from './repositories/userRepos.js'
// import { createUserServices } from './services/userServices.js';
// import { createUserController } from './controllers/userController.js'
// import { createUserRoutes } from './routes/userRouter.js';

import { createAuthRepository } from './repositories/authRepo.js'
import { createAuthServices } from './services/authServices.js';
import { createAuthController } from './controllers/authController.js'
import { createAuthMiddleware } from './middleware/authMiddleware.js'
import { createAuthRoutes } from './routes/authRouter.js';

const sql = createDb();

// const userRepo = createUserRepository(sql);
// const userServices = createUserServices(userRepo);
// const userController = createUserController(userServices);
// const userRoutes = createUserRoutes(userController);

const authRepo = createAuthRepository(sql);
const authServices = createAuthServices(authRepo);
const authController = createAuthController(authServices);
// const authMiddleware = createAuthMiddleware;
const authRoutes = createAuthRoutes(authController);

const __dirname = import.meta.dirname;
const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

// app.use('/users', userRoutes);
// app.use('/auth', authMiddleware, authRoutes);
app.use('/auth', authRoutes);

app.use((err, req, res, next) => {
  if (err.statusCode && err.message)
    return res.status(err.statusCode).json(err.message);

  console.log("error aparently says: " + err);

  return res.status(500).json({ error: 'Internal server error' });
});

export default app;