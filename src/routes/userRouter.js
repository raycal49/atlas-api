import { Router } from 'express';
import { validate } from '../middleware/validationMiddleware.js';
import { selectPlanSchema } from '../schemas/subscriptionSchemas.js';

export const createUserRoutes = (userController, authMiddleware) => {
  const router = Router();
  router.get('/plans', userController.getPlans);
  router.get('/subscriptions/me', authMiddleware, userController.getMySubscription);
  router.post('/subscriptions', authMiddleware, validate(selectPlanSchema), userController.selectPlan);
  return router;
};
