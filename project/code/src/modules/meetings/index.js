import { Router } from 'express';
import { body, param } from 'express-validator';
import handleValidationErrors from '../../common/middleware/validation.js';
import { createMeetingController, getMeetingByIdController } from './meetingController.js';

const meetingRouter = Router();

meetingRouter.post(
  '/',
  [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Meeting title is required')
      .isLength({ max: 200 })
      .withMessage('Title cannot exceed 200 characters'),
    body('description')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Description cannot exceed 2000 characters'),
    body('start_time')
      .exists()
      .withMessage('start_time is required')
      .isISO8601()
      .withMessage('start_time must be a valid ISO8601 date'),
    body('end_time')
      .exists()
      .withMessage('end_time is required')
      .isISO8601()
      .withMessage('end_time must be a valid ISO8601 date'),
    body('organizer_id')
      .exists()
      .withMessage('organizer_id is required')
      .isInt({ min: 1 })
      .withMessage('organizer_id must be a positive integer'),
    body('attendees')
      .exists()
      .withMessage('attendees is required')
      .isArray({ min: 1 })
      .withMessage('At least one attendee is required'),
    body('attendees.*.user_id')
      .exists()
      .withMessage('Each attendee must include user_id')
      .isInt({ min: 1 })
      .withMessage('Each attendee user_id must be a positive integer'),
    body('attendees.*.required')
      .optional()
      .isBoolean()
      .withMessage('required must be a boolean'),
  ],
  handleValidationErrors,
  createMeetingController
);

meetingRouter.get(
  '/:id',
  [
    param('id')
      .exists()
      .withMessage('Meeting id is required')
      .isInt({ min: 1 })
      .withMessage('Meeting id must be a positive integer'),
  ],
  handleValidationErrors,
  getMeetingByIdController
);

export default meetingRouter;
