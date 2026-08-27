import { Router } from 'express';
import path from 'node:path';

export const createPageRouter = ({ authMiddleware, viewsDir }) => {
  const router = Router();

  const sendProtectedPage = (file) => (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(viewsDir, file));
  };

  router.get('/dashboard', authMiddleware, sendProtectedPage('dashboard.html'));
  router.get('/payments', authMiddleware, sendProtectedPage('payments.html'));
  router.get('/usage', authMiddleware, sendProtectedPage('usage.html'));

  return router;
};