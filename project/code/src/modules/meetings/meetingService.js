import AppError from '../../common/errors/AppError.js';
import { createMeetingRecord, findMeetingById } from './meetingRepository.js';

export function normalizeAttendeeList(rawAttendees) {
  if (!Array.isArray(rawAttendees) || rawAttendees.length === 0) {
    throw new AppError('At least one attendee is required', 422, 'VALIDATION_ERROR', {
      field: 'attendees',
    });
  }

  const normalized = [];
  const seenUserIds = new Set();

  rawAttendees.forEach((attendee) => {
    const attendeeObject = typeof attendee === 'object' && attendee !== null
      ? attendee
      : { user_id: attendee };

    const userId = Number(attendeeObject.user_id ?? attendeeObject);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError('Each attendee must include a valid user_id', 422, 'VALIDATION_ERROR', {
        field: 'attendees',
      });
    }

    if (seenUserIds.has(userId)) {
      throw new AppError(`Duplicate attendee user_id: ${userId}`, 422, 'VALIDATION_ERROR', {
        field: 'attendees',
      });
    }

    seenUserIds.add(userId);

    normalized.push({
      user_id: userId,
      required: attendeeObject.required === true || attendeeObject.required === 'true' || attendeeObject.required === 1,
    });
  });

  return normalized;
}

function normalizeTimestamp(value, fieldName) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError(`Invalid ${fieldName}`, 422, 'VALIDATION_ERROR', {
      field: fieldName,
    });
  }

  return timestamp.toISOString();
}

export async function createMeeting(payload) {
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';

  if (!title) {
    throw new AppError('Meeting title is required', 422, 'VALIDATION_ERROR', {
      field: 'title',
    });
  }

  const organizerId = Number(payload?.organizer_id);

  if (!Number.isInteger(organizerId) || organizerId <= 0) {
    throw new AppError('organizer_id must be a positive integer', 422, 'VALIDATION_ERROR', {
      field: 'organizer_id',
    });
  }

  const startTime = normalizeTimestamp(payload?.start_time, 'start_time');
  const endTime = normalizeTimestamp(payload?.end_time, 'end_time');

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    throw new AppError('Meeting end time must be after the start time', 422, 'VALIDATION_ERROR', {
      field: 'end_time',
    });
  }

  const attendees = normalizeAttendeeList(payload?.attendees);
  const description = payload?.description == null ? '' : String(payload.description).trim();

  const createdMeeting = await createMeetingRecord({
    title,
    description,
    start_time: startTime,
    end_time: endTime,
    organizer_id: organizerId,
    attendees,
  });

  const savedMeeting = await findMeetingById(createdMeeting.id);

  if (!savedMeeting) {
    throw new AppError(`Meeting with id ${createdMeeting.id} was not found after creation`, 500, 'MEETING_CREATE_FAILED');
  }

  return savedMeeting;
}

export async function getMeetingById(id) {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new AppError('Meeting id must be a positive integer', 422, 'VALIDATION_ERROR', {
      field: 'id',
    });
  }

  const meeting = await findMeetingById(parsedId);

  if (!meeting) {
    throw new AppError(`Meeting with id ${parsedId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: parsedId,
    });
  }

  return meeting;
}

export default {
  createMeeting,
  getMeetingById,
  normalizeAttendeeList,
};
