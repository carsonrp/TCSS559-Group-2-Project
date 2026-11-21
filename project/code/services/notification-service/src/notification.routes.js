import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { timingSafeEqual } from 'node:crypto';
import { env } from './config/env.js';
import { ServiceError } from './errors.js';
import { sendNotificationController } from './notification.controller.js';

const router = Router();

function validateRequest(req, _res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ServiceError('Validation failed', 422, 'VALIDATION_ERROR', errors.array()));
  }
  return next();
}

function authorizeMeetingService(req, _res, next) {
  if (!env.INTERNAL_SERVICE_TOKEN) {
    return next(new ServiceError(
      'Notification Service credentials are not configured',
      503,
      'SERVICE_NOT_CONFIGURED'
    ));
  }
  const authorization = req.get('authorization') ?? '';
  const supplied = Buffer.from(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  const expected = Buffer.from(env.INTERNAL_SERVICE_TOKEN);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return next(new ServiceError('A valid internal bearer token is required', 401, 'UNAUTHORIZED'));
  }
  return next();
}

router.post(
  '/:type',
  [
    param('type').isIn(['created', 'updated', 'deleted', 'blocked', 'rescheduled'])
      .withMessage('type must be a supported notification event'),
    body('meeting').isObject().withMessage('meeting must be an object'),
  ],
  validateRequest,
  authorizeMeetingService,
  sendNotificationController
);

export default router;
