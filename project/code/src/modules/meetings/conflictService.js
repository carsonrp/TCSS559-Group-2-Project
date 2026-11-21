import AppError from '../../common/errors/AppError.js';
import { findConflictingMeetings, findUsersByIds } from './meetingRepository.js';

export function normalizeAttendeeIds(rawIds) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new AppError('At least one attendee is required', 422, 'VALIDATION_ERROR', {
      field: 'attendees',
    });
  }

  const ids = rawIds.map((value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('Attendee ids must be positive integers', 422, 'VALIDATION_ERROR', {
        field: 'attendees',
      });
    }
    return id;
  });

  if (new Set(ids).size !== ids.length) {
    throw new AppError('Attendee ids must not contain duplicates', 422, 'VALIDATION_ERROR', {
      field: 'attendees',
    });
  }

  return ids;
}

export function normalizeSchedule(start, end) {
  const startTime = new Date(start);
  const endTime = new Date(end);

  if (Number.isNaN(startTime.getTime())) {
    throw new AppError('Invalid start_time', 422, 'VALIDATION_ERROR', { field: 'start_time' });
  }
  if (Number.isNaN(endTime.getTime())) {
    throw new AppError('Invalid end_time', 422, 'VALIDATION_ERROR', { field: 'end_time' });
  }
  if (endTime <= startTime) {
    throw new AppError('end_time must be after start_time', 422, 'VALIDATION_ERROR', {
      field: 'end_time',
    });
  }

  return { start_time: startTime.toISOString(), end_time: endTime.toISOString() };
}

export async function getConflictingMeetings(
  { start_time, end_time, attendee_ids, exclude_meeting_id },
  queryable
) {
  const schedule = normalizeSchedule(start_time, end_time);
  const attendeeIds = normalizeAttendeeIds(attendee_ids);
  return findConflictingMeetings(
    { ...schedule, attendee_ids: attendeeIds, exclude_meeting_id },
    queryable
  );
}

export async function assertNoSchedulingConflict(schedule, queryable) {
  const conflictingMeetings = await getConflictingMeetings(schedule, queryable);
  if (conflictingMeetings.length > 0) {
    throw new AppError('The requested schedule conflicts with an existing meeting', 409, 'SCHEDULING_CONFLICT', {
      conflictingMeetings: conflictingMeetings.map((meeting) => ({
        meetingId: meeting.meeting_id,
        title: meeting.title,
      })),
    });
  }
}

export async function validateMeetingSchedule({ start, end, attendees }) {
  const schedule = normalizeSchedule(start, end);
  const attendeeIds = normalizeAttendeeIds(attendees);
  const existingUserIds = await findUsersByIds(attendeeIds);
  const missingId = attendeeIds.find((id) => !existingUserIds.includes(id));
  if (missingId !== undefined) {
    throw new AppError(`User with id ${missingId} was not found`, 404, 'USER_NOT_FOUND', {
      user_id: missingId,
    });
  }
  const conflictingMeetings = await getConflictingMeetings({
    ...schedule,
    attendee_ids: attendeeIds,
  });

  return {
    conflict: conflictingMeetings.length > 0,
    conflictingMeetings: conflictingMeetings.map((meeting) => ({
      meetingId: meeting.meeting_id,
      title: meeting.title,
    })),
  };
}

export default {
  assertNoSchedulingConflict,
  getConflictingMeetings,
  normalizeAttendeeIds,
  normalizeSchedule,
  validateMeetingSchedule,
};
