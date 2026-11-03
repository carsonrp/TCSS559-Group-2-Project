import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import meetingRouter from './src/modules/meetings/index.js';
import { errorHandler, notFoundHandler } from './src/common/errors/index.js';

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'MeetingLoop',
    uptime: process.uptime(),
  });
});

app.use('/api/meetings', meetingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
