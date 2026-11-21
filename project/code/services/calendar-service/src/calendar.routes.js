import { Router } from 'express';
import {
  createEvent,
  deleteEvent,
  deleteEventByMeetingId,
  getAvailableSlots,
  getEvent,
  updateEvent,
  updateEventByMeetingId,
} from './calendar.controller.js';

const router = Router();

router.post('/events', createEvent);
router.get('/events/:id', getEvent);
router.put('/events/by-meeting/:meetingId', updateEventByMeetingId);
router.delete('/events/by-meeting/:meetingId', deleteEventByMeetingId);
router.put('/events/:id', updateEvent);
router.delete('/events/:id', deleteEvent);
router.get('/availability', getAvailableSlots);

export default router;
