import path from 'node:path';

import argon2 from 'argon2';
import { SignJWT } from 'jose';
import request from 'supertest';
import { vi } from 'vitest';

import { createApp } from '../../app.js';
import { createAuthController } from '../../controllers/authController.js';
import { createUserController } from '../../controllers/userController.js';
import { createAuthMiddleware } from '../../middleware/authMiddleware.js';
import { createErrorHandler } from '../../middleware/errorMiddleware.js';
import { createAuthRoutes } from '../../routes/authRouter.js';
import { createPageRoutes } from '../../routes/pageRouter.js';
import { createUserRoutes } from '../../routes/userRouter.js';
import { createAuthServices } from '../../services/authServices.js';
import { createUserServices } from '../../services/userServices.js';

const TEST_JWT_SECRET = 'http-test-secret';
const testJwtKey = new TextEncoder().encode(TEST_JWT_SECRET);

export const TEST_USER_ID = '8e1c4c22-0f7a-4a1e-9f0e-1b2c3d4e5f60';
export const TEST_USERNAME = 'testuser';
export const TEST_PASSWORD = 'Password123';
export const TEST_EMAIL = 'testuser@example.test';

export const PERIOD_START = new Date('2026-03-15T00:00:00Z');
export const NEXT_BILL_DUE = new Date('2026-04-15T00:00:00Z');

const SUBSCRIPTION_ID = 5;
const PLAN_ID = 2;

let passwordHash;

const getPasswordHash = () =>
  (passwordHash ??= argon2.hash(TEST_PASSWORD));

const fakeAuthRepository = () => ({
  findUserCredentials: vi.fn(async (username) => {
    if (username !== TEST_USERNAME) return undefined;

    return {
      user_id: TEST_USER_ID,
      hash: await getPasswordHash(),
    };
  }),
  checkUserExists: vi.fn().mockResolvedValue(false),
  insertUser: vi.fn().mockResolvedValue({ user_id: TEST_USER_ID }),
});

const fakeUserRepository = () => ({
  findAllActivePlans: vi.fn().mockResolvedValue([]),
  findActivePlanByName: vi.fn().mockResolvedValue(undefined),

  findActiveSubscription: vi.fn().mockResolvedValue(undefined),
  findPlanById: vi.fn().mockResolvedValue(undefined),
  findCurrentPeriod: vi.fn().mockResolvedValue(undefined),

  findUsageLogPage: vi.fn().mockResolvedValue({
    calls: [],
    total: 0,
  }),
  findAllApiProducts: vi.fn().mockResolvedValue([]),
  getPeriodApiCalls: vi.fn().mockResolvedValue([]),

  findPaymentHistory: vi.fn().mockResolvedValue([]),

  subscribeToPlan: vi.fn().mockResolvedValue(1),
  changePlan: vi.fn().mockResolvedValue(2),
});

export const buildApp = () => {
  const authRepository = fakeAuthRepository();
  const userRepository = fakeUserRepository();

  const authServices = createAuthServices(authRepository, testJwtKey);
  const userServices = createUserServices(userRepository);
  const authMiddleware = createAuthMiddleware(testJwtKey);

  const app = createApp({
    publicDir: path.join(import.meta.dirname, '../../public'),

    authRoutes: createAuthRoutes(
      createAuthController(authServices),
    ),

    userRoutes: createUserRoutes(
      createUserController(userServices),
      authMiddleware,
    ),

    pageRoutes: createPageRoutes({
      authMiddleware,
      viewsDir: path.join(import.meta.dirname, '../../views'),
    }),

    errorHandler: createErrorHandler(),
  });

  return {
    app,
    authRepository,
    userRepository,
  };
};

export const givenSubscribedUser = (
  userRepository,
  {
    planName = 'launch',
    pricePerMonth = '9.99',
    startedAt = PERIOD_START,
    periodStart = PERIOD_START,
    nextBillDue = NEXT_BILL_DUE,
    apis = [],
  } = {},
) => {
  userRepository.findActiveSubscription.mockResolvedValue({
    subscription_id: SUBSCRIPTION_ID,
    plan_id: PLAN_ID,
    started_at: startedAt,
  });

  userRepository.findPlanById.mockResolvedValue({
    plan_id: PLAN_ID,
    plan_name: planName,
    price_per_month: pricePerMonth,
  });

  userRepository.findCurrentPeriod.mockResolvedValue({
    period_start: periodStart,
    next_bill_due: nextBillDue,
  });

  userRepository.getPeriodApiCalls.mockResolvedValue(apis);
};

export const signedInAgent = async (app) => {
  const agent = request.agent(app);

  const response = await agent
    .post('/auth/login')
    .send({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });

  if (response.status !== 200) {
    throw new Error(
      `signedInAgent could not log in: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return agent;
};

export const signToken = async (
  claims,
  {
    secret = TEST_JWT_SECRET,
    expSeconds,
  } = {},
) => {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(expSeconds ?? now + 3600)
    .sign(new TextEncoder().encode(secret));
};

export const tokenCookie = async (
  claims = { id: TEST_USER_ID },
) => `token=${await signToken(claims)}`;