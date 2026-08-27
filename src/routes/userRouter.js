import { Router } from 'express';
import { validateBody, validateQuery } from '../middleware/validationMiddleware.js';
import { selectPlanSchema } from '../schemas/subscriptionSchemas.js';
import { usageLogQuerySchema } from '../schemas/usageSchemas.js';

export const createUserRouter = (userController, authMiddleware) => {
  const router = Router();
  router.get('/plans', userController.getPlans);
  router.get('/data', authMiddleware, userController.getDashboard);
  router.get('/usage/log', authMiddleware, validateQuery(usageLogQuerySchema), userController.getUsageLog);
  router.get('/usage/apis', authMiddleware, userController.getApiProducts);
  router.get('/payments/me', authMiddleware, userController.getPaymentHistory);
  router.post('/subscriptions', authMiddleware, validateBody(selectPlanSchema), userController.selectPlan);
  return router;
};
