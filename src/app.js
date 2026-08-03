import express from 'express';
import cookieParser from 'cookie-parser';
import logger from 'morgan';

export const createApp = ({
  publicDir,
  authRoutes,
  userRoutes,
  pageRoutes,
  errorHandler,
}) =>{
  const app = express();

  app.use(logger('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use(express.static(publicDir));

  app.use('/auth', authRoutes);
  app.use('/', pageRoutes);
  app.use('/', userRoutes);

  app.use(errorHandler);

  return app;
};