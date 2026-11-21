import { Router } from 'express';
import { body, param, query } from 'express-validator';
import handleValidationErrors from '../../common/middleware/validation.js';
import {
  createAvailabilityController,
  deleteAvailabilityController,
  findCommonAvailabilityController,
  listAvailabilityController,
} from './availabilityController.js';

const availabilityRouter = Router();

availabilityRouter.get(
  '/meetings/availability/common',
  [
    query('attendees').exists().withMessage('attendees is required').bail().isString()
      .withMessage('attendees must be a comma-separated list')
      .bail()
      .custom((value) => {
        const ids = value.split(',').map((id) => Number(id.trim()));
        if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
          throw new Error('attendees must contain positive integer ids');
        }
        if (new Set(ids).size !== ids.length) {
          throw new Error('attendees must not contain duplicates');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  findCommonAvailabilityController
);

availabilityRouter.post(
  '/users/:id/availability',
  [
    param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
    body('available_start').exists().withMessage('available_start is required').bail().isISO8601()
      .withMessage('available_start must be a valid ISO8601 date'),
    body('available_end').exists().withMessage('available_end is required').bail().isISO8601()
      .withMessage('available_end must be a valid ISO8601 date')
      .bail()
      .custom((value, { req }) => {
        if (new Date(value).getTime() <= new Date(req.body.available_start).getTime()) {
          throw new Error('available_end must be after available_start');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  createAvailabilityController
);

availabilityRouter.get(
  '/users/:id/availability',
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')],
  handleValidationErrors,
  listAvailabilityController
);

availabilityRouter.delete(
  '/availability/:id',
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')],
  handleValidationErrors,
  deleteAvailabilityController
);

export default availabilityRouter;
