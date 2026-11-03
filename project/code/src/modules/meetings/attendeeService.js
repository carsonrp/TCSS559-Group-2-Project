import AppError from '../../common/errors/AppError.js';
import {
  addMeetingAttendee,
  findMeetingAttendee,
  findMeetingAttendees,
  findUserById,
  removeMeetingAttendee,
} from './attendeeRepository.js';
import { assertNoSchedulingConflict } from './conflictService.js';
import { findMeetingById, lockMeetingRecord, withUserLocks } from './meetingRepository.js';

function parseId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${field} must be a positive integer`, 422, 'VALIDATION_ERROR', { field });
  }
  return id;
}

async function requireMeeting(id, queryable) {
  const meeting = await findMeetingById(id, queryable);
  if (!meeting) {
    throw new AppError(`Meeting with id ${id} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: id,
    });
  }
  return meeting;
}

export async function listMeetingAttendees(meetingId) {
  const id = parseId(meetingId, 'id');
  await requireMeeting(id);
  return findMeetingAttendees(id);
}

export async function addAttendee(meetingId, payload = {}) {
  const id = parseId(meetingId, 'id');
  const userId = parseId(payload.user_id, 'user_id');
  const required = payload.required ?? true;
  if (typeof required !== 'boolean') {
    throw new AppError('required must be a boolean', 422, 'VALIDATION_ERROR', {
      field: 'required',
    });
  }

  await requireMeeting(id);
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(`User with id ${userId} was not found`, 404, 'USER_NOT_FOUND', {
      user_id: userId,
    });
  }

  return withUserLocks([userId], async (client) => {
    if (!(await lockMeetingRecord(id, client))) {
      throw new AppError(`Meeting with id ${id} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: id,
      });
    }
    const meeting = await requireMeeting(id, client);
    if (await findMeetingAttendee(id, userId, client)) {
      throw new AppError(`User ${userId} is already an attendee`, 422, 'VALIDATION_ERROR', {
        field: 'user_id',
      });
    }

    await assertNoSchedulingConflict({
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      attendee_ids: [userId],
      exclude_meeting_id: id,
    }, client);
    await addMeetingAttendee(id, userId, required, client);
    const attendees = await findMeetingAttendees(id, client);
    return attendees.find((attendee) => attendee.user_id === userId);
  });
}

export async function removeAttendee(meetingId, userId) {
  const id = parseId(meetingId, 'id');
  const attendeeId = parseId(userId, 'userId');
  await requireMeeting(id);
  await withUserLocks([attendeeId], async (client) => {
    if (!(await lockMeetingRecord(id, client))) {
      throw new AppError(`Meeting with id ${id} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: id,
      });
    }
    const removed = await removeMeetingAttendee(id, attendeeId, client);
    if (!removed) {
      throw new AppError(`User ${attendeeId} is not an attendee of meeting ${id}`, 404, 'ATTENDEE_NOT_FOUND', {
        meeting_id: id,
        user_id: attendeeId,
      });
    }
  });
}

export default { addAttendee, listMeetingAttendees, removeAttendee };
