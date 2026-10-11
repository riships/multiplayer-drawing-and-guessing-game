import express, { Application } from 'express';
import cors from 'cors';
import { CONFIG } from './config';
import { healthRouter } from './routes/health.route';

export function createApp(): Application {
  const app = express();

  // Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: CONFIG.CORS_ORIGIN,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      credentials: true,
    }),
  );

  // Body Parsing Middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use('/', healthRouter);

  return app;
}
