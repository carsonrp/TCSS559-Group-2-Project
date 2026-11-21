import { Router } from 'express';
import { body, param } from 'express-validator';
import handleValidationErrors from '../../common/middleware/validation.js';
import {
  addAttendeeController,
  listMeetingAttendeesController,
  removeAttendeeController,
} from './attendeeController.js';

const attendeeRouter = Router();

attendeeRouter.post(
  '/:id/attendees',
  [
    param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
    body('user_id').exists().withMessage('user_id is required').bail().isInt({ min: 1 })
      .withMessage('user_id must be a positive integer'),
    body('required').optional().isBoolean({ strict: true }).withMessage('required must be a boolean'),
  ],
  handleValidationErrors,
  addAttendeeController
);

attendeeRouter.get(
  '/:id/attendees',
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')],
  handleValidationErrors,
  listMeetingAttendeesController
);

attendeeRouter.delete(
  '/:id/attendees/:userId',
  [
    param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
    param('userId').isInt({ min: 1 }).withMessage('userId must be a positive integer'),
  ],
  handleValidationErrors,
  removeAttendeeController
);

export default attendeeRouter;
