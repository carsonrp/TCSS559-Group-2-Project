import * as service from './calendar.service.js';

export async function createEvent(req, res, next) {
  try {
    res.status(201).json({ data: await service.createCalendarEvent(req.body) });
  } catch (error) {
    next(error);
  }
}

export async function getEvent(req, res, next) {
  try {
    res.status(200).json({ data: await service.getCalendarEvent(req.params.id) });
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(req, res, next) {
  try {
    res.status(200).json({ data: await service.updateCalendarEvent(req.params.id, req.body) });
  } catch (error) {
    next(error);
  }
}

export async function deleteEvent(req, res, next) {
  try {
    await service.deleteCalendarEvent(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function updateEventByMeetingId(req, res, next) {
  try {
    res.status(200).json({ data: await service.updateCalendarEventByMeetingId(req.params.meetingId, req.body) });
  } catch (error) {
    next(error);
  }
}

export async function deleteEventByMeetingId(req, res, next) {
  try {
    await service.deleteCalendarEventByMeetingId(req.params.meetingId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function getAvailableSlots(req, res, next) {
  try {
    const rawUsers = typeof req.query.users === 'string' ? req.query.users.split(',').map((id) => id.trim()) : [];
    res.status(200).json({ availableSlots: await service.findAvailableSlots(rawUsers) });
  } catch (error) {
    next(error);
  }
}
