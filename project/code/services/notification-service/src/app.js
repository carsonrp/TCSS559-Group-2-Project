import express from 'express';
import notificationRouter from './notification.routes.js';
import { errorHandler } from './errors.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.status(200).json({
  status: 'ok',
  service: 'notification-service',
}));
app.use('/notifications', notificationRouter);
app.use((_req, res) => res.status(404).json({
  error: { code: 'NOT_FOUND', message: 'Route not found', details: null },
}));
app.use(errorHandler);

export default app;
