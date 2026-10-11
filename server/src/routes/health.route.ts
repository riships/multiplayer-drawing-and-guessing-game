import { Router } from 'express';
import { getHealth, getStatus } from '../controllers/health.controller';

export const healthRouter = Router();

healthRouter.get('/health', getHealth);
healthRouter.get('/api/status', getStatus);
