import { createMeeting, getMeetingById, listMeetings } from './meetingService.js';

export async function createMeetingController(req, res, next) {
  try {
    const meeting = await createMeeting(req.body);
    res.status(201).json({ data: meeting });
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

export async function listMeetingsController(req, res, next) {
  try {
    const meetings = await listMeetings({ start: req.query.start, end: req.query.end });
    res.status(200).json({ data: meetings });
  } catch (error) {
    next(error);
  }
}

export default {
  listMeetings: listMeetingsController,
  createMeeting: createMeetingController,
  getMeetingById: getMeetingByIdController,
};
