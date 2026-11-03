import {
  createMeeting,
  deleteMeeting,
  getMeetingById,
  listMeetings,
  updateMeeting,
} from './meetingService.js';
import { validateMeetingSchedule } from './conflictService.js';

export async function createMeetingController(req, res, next) {
  try {
    const meeting = await createMeeting(req.body);
    res.status(201).json({ data: meeting });
  } catch (error) {
    next(error);
  }
}

export async function listMeetingsController(req, res, next) {
  try {
    const result = await listMeetings(req.query.page ?? 1, req.query.limit ?? 20);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getMeetingByIdController(req, res, next) {
  try {
    const meeting = await getMeetingById(req.params.id);
    res.status(200).json({ data: meeting });
  } catch (error) {
    next(error);
  }
}

export async function updateMeetingController(req, res, next) {
  try {
    const meeting = await updateMeeting(req.params.id, req.body);
    res.status(200).json({ data: meeting });
  } catch (error) {
    next(error);
  }
}

export async function deleteMeetingController(req, res, next) {
  try {
    await deleteMeeting(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function validateMeetingScheduleController(req, res, next) {
  try {
    const result = await validateMeetingSchedule({
      start: req.query.start,
      end: req.query.end,
      attendees: req.query.attendees.split(',').map((id) => id.trim()),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export default {
  createMeeting: createMeetingController,
  deleteMeeting: deleteMeetingController,
  getMeetingById: getMeetingByIdController,
  listMeetings: listMeetingsController,
  updateMeeting: updateMeetingController,
  validateMeetingSchedule: validateMeetingScheduleController,
};
