import { Router } from 'express';
import { body, param } from 'express-validator';
import { timingSafeEqual } from 'node:crypto';
import AppError from '../../common/errors/AppError.js';
import { env } from '../../common/config/env.js';
import handleValidationErrors from '../../common/middleware/validation.js';
import { sendNotificationController } from './notification.controller.js';

const router = Router();

function authorizeInternalService(req, _res, next) {
  const expected = env.INTERNAL_SERVICE_TOKEN;
  const authorization = req.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expected) {
    return next(new AppError('Internal notification API is not configured', 503, 'SERVICE_NOT_CONFIGURED'));
  }
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return next(new AppError('A valid internal service token is required', 401, 'UNAUTHORIZED'));
  }
  return next();
}

router.post(
  '/:type',
  [
    param('type').isIn(['created', 'updated', 'deleted', 'blocked', 'rescheduled']),
    body('meeting').isObject().withMessage('meeting must be an object'),
  ],
  authorizeInternalService,
  handleValidationErrors,
  sendNotificationController
);

export default router;
