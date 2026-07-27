import { Router } from 'express';
import { validate, validateQuery } from '../middleware/validationMiddleware.js';
import { selectPlanSchema } from '../schemas/subscriptionSchemas.js';
import { usageLogQuerySchema } from '../schemas/usageSchemas.js';

export const createUserRoutes = (userController, authMiddleware) => {
  const router = Router();
  router.get('/plans', userController.getPlans);
  router.get('/subscriptions/me', authMiddleware, userController.getMySubscription);
  router.get('/usage/me', authMiddleware, userController.getMyUsage);
  router.get('/usage/log', authMiddleware, validateQuery(usageLogQuerySchema), userController.getMyUsageLog);
  router.get('/payments/me', authMiddleware, userController.getMyPayments);
  router.post('/subscriptions', authMiddleware, validate(selectPlanSchema), userController.selectPlan);
  return router;
};
