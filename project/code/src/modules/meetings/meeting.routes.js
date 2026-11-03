import { Router } from 'express';
import { body, param, query } from 'express-validator';
import handleValidationErrors from '../../common/middleware/validation.js';
import {
  createMeetingController,
  deleteMeetingController,
  getMeetingByIdController,
  listMeetingsController,
  updateMeetingController,
  validateMeetingScheduleController,
} from './meetingController.js';

const meetingRouter = Router();

const validateTimeOrder = (endValue, { req, path }) => {
  if (!req.body.start_time || !endValue) {
    return true;
  }
  if (new Date(endValue).getTime() <= new Date(req.body.start_time).getTime()) {
    throw new Error(`${path} must be after start_time`);
  }
  return true;
};

const validateAttendees = body('attendees')
  .exists()
  .withMessage('attendees is required')
  .bail()
  .isArray()
  .withMessage('attendees must be an array')
  .bail()
  .custom((attendees) => {
    if (attendees.length === 0) {
      throw new Error('At least one attendee is required');
    }
    const ids = attendees.map((attendee) => Number(
      typeof attendee === 'object' && attendee !== null ? attendee.user_id : attendee
    ));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error('Each attendee must include a positive integer user_id');
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error('Attendee user_ids must not contain duplicates');
    }
    return true;
  });

const validateAttendeeRequired = body('attendees.*.required')
  .optional()
  .isBoolean({ strict: true })
  .withMessage('required must be a boolean');

meetingRouter.post(
  '/',
  [
    body('title')
      .isString()
      .withMessage('title must be a string')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('Meeting title is required')
      .bail()
      .isLength({ max: 200 })
      .withMessage('Title cannot exceed 200 characters'),
    body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
    body('start_time').exists().withMessage('start_time is required').bail().isISO8601()
      .withMessage('start_time must be a valid ISO8601 date'),
    body('end_time').exists().withMessage('end_time is required').bail().isISO8601()
      .withMessage('end_time must be a valid ISO8601 date')
      .bail()
      .custom(validateTimeOrder),
    body('organizer_id').exists().withMessage('organizer_id is required').bail().isInt({ min: 1 })
      .withMessage('organizer_id must be a positive integer'),
    validateAttendees,
    validateAttendeeRequired,
    body('status').optional().isString().isLength({ min: 1, max: 50 })
      .withMessage('status must be between 1 and 50 characters'),
  ],
  handleValidationErrors,
  createMeetingController
);

meetingRouter.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 })
      .withMessage('limit must be an integer between 1 and 100'),
  ],
  handleValidationErrors,
  listMeetingsController
);

meetingRouter.get(
  '/validate',
  [
    query('start').exists().withMessage('start is required').bail().isISO8601()
      .withMessage('start must be a valid ISO8601 date'),
    query('end').exists().withMessage('end is required').bail().isISO8601()
      .withMessage('end must be a valid ISO8601 date'),
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
    query('end').custom((value, { req }) => {
      if (new Date(value).getTime() <= new Date(req.query.start).getTime()) {
        throw new Error('end must be after start');
      }
      return true;
    }),
  ],
  handleValidationErrors,
  validateMeetingScheduleController
);

meetingRouter.get('/:id', [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')], handleValidationErrors, getMeetingByIdController);

meetingRouter.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
    body().custom((_value, { req }) => {
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new Error('At least one meeting field is required');
      }
      return true;
    }),
    body('title').optional().isString().bail().trim().notEmpty().isLength({ max: 200 })
      .withMessage('title must contain 1 to 200 characters'),
    body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
    body('start_time').optional().isISO8601().withMessage('start_time must be a valid ISO8601 date'),
    body('end_time').optional().isISO8601().withMessage('end_time must be a valid ISO8601 date')
      .bail().custom(validateTimeOrder),
    body('status').optional().isString().isLength({ min: 1, max: 50 })
      .withMessage('status must be between 1 and 50 characters'),
    body().custom((_value, { req }) => {
      const allowed = new Set(['title', 'description', 'start_time', 'end_time', 'status']);
      const unknown = Object.keys(req.body ?? {}).find((key) => !allowed.has(key));
      if (unknown) {
        throw new Error(`Unknown meeting field: ${unknown}`);
      }
      return true;
    }),
  ],
  handleValidationErrors,
  updateMeetingController
);

meetingRouter.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')],
  handleValidationErrors,
  deleteMeetingController
);

export default meetingRouter;
