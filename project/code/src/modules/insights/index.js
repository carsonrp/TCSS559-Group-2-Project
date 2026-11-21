import { Router } from 'express';
import { param, query } from 'express-validator';
import handleValidationErrors from '../../common/middleware/validation.js';
import { getInsightsSummaryController, getMeetingInsightsController } from './insightController.js';

const insightRouter = Router();

insightRouter.get(
  '/summary',
  [
    query('start').optional().isISO8601().withMessage('start must be a valid ISO8601 date'),
    query('end').optional().isISO8601().withMessage('end must be a valid ISO8601 date'),
  ],
  handleValidationErrors,
  getInsightsSummaryController
);

insightRouter.get(
  '/meetings/:id',
  [param('id').isInt({ min: 1 }).withMessage('Meeting id must be a positive integer')],
  handleValidationErrors,
  getMeetingInsightsController
);

export default insightRouter;
