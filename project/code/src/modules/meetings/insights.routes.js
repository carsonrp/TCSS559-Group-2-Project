import { Router } from 'express';
import { param, query } from 'express-validator';
import handleValidationErrors from '../../common/middleware/validation.js';
import {
  getMeetingSummaryController,
  getSingleMeetingInsightsController,
} from './insights.controller.js';

const router = Router();

router.get(
  '/summary',
  [
    query('start')
      .exists()
      .withMessage('start is required')
      .bail()
      .isISO8601({ strict: true })
      .withMessage('start must be a valid ISO 8601 date-time'),
    query('end')
      .exists()
      .withMessage('end is required')
      .bail()
      .isISO8601({ strict: true })
      .withMessage('end must be a valid ISO 8601 date-time')
      .bail()
      .custom((value, { req }) => {
        if (new Date(value).getTime() < new Date(req.query.start).getTime()) {
          throw new Error('end must be greater than or equal to start');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  getMeetingSummaryController
);

router.get(
  '/meetings/:id',
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')],
  handleValidationErrors,
  getSingleMeetingInsightsController
);

export default router;
