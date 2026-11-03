import { createMeeting, getMeetingById } from './meetingService.js';

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

export default {
  createMeeting: createMeetingController,
  getMeetingById: getMeetingByIdController,
};
