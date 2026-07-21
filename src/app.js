import express from 'express';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import { createDb } from './database/db.js';

import { createUserRepository } from './repositories/userRepos.js'
import { createUserServices } from './services/userServices.js';
import { createUserController } from './controllers/userController.js'
import { createUserRoutes } from './routes/userRouter.js';

import { createAuthRepository } from './repositories/authRepo.js'
import { createAuthServices } from './services/authServices.js';
import { createAuthController } from './controllers/authController.js'
import { createAuthMiddleware } from './middleware/authMiddleware.js'
import { createAuthRoutes } from './routes/authRouter.js';

const sql = createDb();

const authRepo = createAuthRepository(sql);
const authServices = createAuthServices(authRepo);
const authController = createAuthController(authServices);
const authMiddleware = createAuthMiddleware();
const authRoutes = createAuthRoutes(authController);

// user routes apply authMiddleware per-route, so it must exist before this chain
const userRepo = createUserRepository(sql);
const userServices = createUserServices(userRepo);
const userController = createUserController(userServices);
const userRoutes = createUserRoutes(userController, authMiddleware);

const __dirname = import.meta.dirname;
const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRoutes);
app.use('/', userRoutes); // mounted at root so paths are exactly /plans and /subscriptions

// dashboard.html lives in views/ (outside the static mapping) so the only way
// to reach it is this route, which runs auth first
app.get('/dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.use((err, req, res, next) => {
  // a browser NAVIGATING to a protected page should land on login, not see JSON.
  // fetch sends Accept: */* which resolves to 'json' here; a real page
  // navigation sends Accept: text/html and resolves to 'html'
  if (err.statusCode === 401 && req.accepts(['json', 'html']) === 'html')
    return res.redirect('/login.html');

  if (err.statusCode && err.message)
    return res.status(err.statusCode).json(err.message);

  console.error(err);

  return res.status(500).json({ error: 'Internal server error' });
});

export default app;