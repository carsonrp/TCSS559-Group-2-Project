import { Router } from 'express';
import { body, header, param, query } from 'express-validator';
import handleValidationErrors from '../../common/middleware/validation.js';
import {
  addDependencyController,
  addPrerequisiteController,
  createActionItemController,
  getReadinessController,
  listActionItemsController,
  listDependenciesController,
  updateActionItemController,
} from './controller.js';
import { ACTION_ITEM_STATUSES } from './actionItemService.js';

const router = Router();

const idParam = param('id').isInt({ min: 1 }).withMessage('id must be a positive integer');
const asOfQuery = query('as_of').optional().isISO8601().withMessage('as_of must be an ISO 8601 date-time');

// Dependencies
router.post(
  '/meetings/:id/dependencies',
  [
    idParam,
    body('upstream_meeting_id')
      .exists()
      .withMessage('upstream_meeting_id is required')
      .bail()
      .isInt({ min: 1 })
      .withMessage('upstream_meeting_id must be a positive integer'),
    body('min_gap_hours')
      .optional()
      .isInt({ min: 0, max: 8760 })
      .withMessage('min_gap_hours must be an integer from 0 to 8760'),
  ],
  handleValidationErrors,
  addDependencyController
);

router.get('/meetings/:id/dependencies', [idParam, asOfQuery], handleValidationErrors, listDependenciesController);

// Readiness
router.get('/meetings/:id/readiness', [idParam, asOfQuery], handleValidationErrors, getReadinessController);

// Action items
router.post(
  '/meetings/:id/action-items',
  [
    idParam,
    body('description')
      .isString()
      .withMessage('description is required')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('description is required')
      .isLength({ max: 2000 })
      .withMessage('description cannot exceed 2000 characters'),
    body('owner_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('owner_id must be a positive integer'),
    body('due_date').optional({ values: 'null' }).isISO8601().withMessage('due_date must be an ISO 8601 date-time'),
    body('origin').optional().isIn(['manual', 'ai']).withMessage('origin must be manual or ai'),
    body('evidence_quote').optional({ values: 'null' }).isString().withMessage('evidence_quote must be a string'),
  ],
  handleValidationErrors,
  createActionItemController
);

router.get(
  '/action-items',
  [
    query('meeting_id').optional().isInt({ min: 1 }).withMessage('meeting_id must be a positive integer'),
    query('owner_id').optional().isInt({ min: 1 }).withMessage('owner_id must be a positive integer'),
    query('status').optional().isIn(ACTION_ITEM_STATUSES).withMessage(`status must be one of ${ACTION_ITEM_STATUSES.join(', ')}`),
  ],
  handleValidationErrors,
  listActionItemsController
);

router.patch(
  '/action-items/:id',
  [
    idParam,
    header('X-User-Id').optional().isInt({ min: 1 }).withMessage('X-User-Id must be a positive integer'),
    body('status').optional().isIn(ACTION_ITEM_STATUSES).withMessage(`status must be one of ${ACTION_ITEM_STATUSES.join(', ')}`),
    body('owner_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('owner_id must be a positive integer'),
    body('due_date').optional({ values: 'null' }).isISO8601().withMessage('due_date must be an ISO 8601 date-time'),
    body().custom((value) => {
      if (!['status', 'owner_id', 'due_date'].some((field) => value?.[field] !== undefined)) {
        throw new Error('Provide at least one of status, owner_id, due_date');
      }
      return true;
    }),
  ],
  handleValidationErrors,
  updateActionItemController
);

// Prerequisites
router.post(
  '/meetings/:id/prerequisites',
  [
    idParam,
    body('kind').isIn(['action_item', 'document']).withMessage('kind must be action_item or document'),
    body('action_item_id')
      .if(body('kind').equals('action_item'))
      .isInt({ min: 1 })
      .withMessage('action_item_id is required for kind action_item'),
    body('title')
      .if(body('kind').equals('document'))
      .isString()
      .bail()
      .trim()
      .notEmpty()
      .withMessage('title is required for kind document'),
    body('document_url').optional({ values: 'null' }).isURL().withMessage('document_url must be a valid URL'),
    body('due_date').optional({ values: 'null' }).isISO8601().withMessage('due_date must be an ISO 8601 date-time'),
    body('required').optional().isBoolean({ strict: true }).withMessage('required must be a boolean'),
    body('done').optional().isBoolean({ strict: true }).withMessage('done must be a boolean'),
  ],
  handleValidationErrors,
  addPrerequisiteController
);

export default router;
