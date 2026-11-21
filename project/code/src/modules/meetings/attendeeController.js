import {
  addAttendee,
  listMeetingAttendees,
  removeAttendee,
} from './attendeeService.js';

export async function addAttendeeController(req, res, next) {
  try {
    const attendee = await addAttendee(req.params.id, req.body);
    res.status(201).json({ data: attendee });
  } catch (error) {
    next(error);
  }
}

export async function listMeetingAttendeesController(req, res, next) {
  try {
    const attendees = await listMeetingAttendees(req.params.id);
    res.status(200).json({ data: attendees });
  } catch (error) {
    next(error);
  }
}

export async function removeAttendeeController(req, res, next) {
  try {
    await removeAttendee(req.params.id, req.params.userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export default {
  addAttendee: addAttendeeController,
  listMeetingAttendees: listMeetingAttendeesController,
  removeAttendee: removeAttendeeController,
};
