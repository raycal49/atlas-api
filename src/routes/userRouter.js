import { Router } from 'express';
import { validateBody, validateQuery } from '../middleware/validationMiddleware.js';
import { selectPlanSchema } from '../schemas/subscriptionSchemas.js';
import { usageLogQuerySchema } from '../schemas/usageSchemas.js';

export const createUserRoutes = (userController, authMiddleware) => {
  const router = Router();
  router.get('/plans', userController.getPlans);
  router.get('/data', authMiddleware, userController.getDashboardData);
  router.get('/usage/log', authMiddleware, validateQuery(usageLogQuerySchema), userController.getUsageLogPage);
  router.get('/usage/apis', authMiddleware, userController.getApiProducts);
  router.get('/payments/me', authMiddleware, userController.getMyPayments);
  router.post('/subscriptions', authMiddleware, validateBody(selectPlanSchema), userController.selectPlan);
  return router;
};
