import AppError from '../../common/errors/AppError.js';
import {
  createMeetingRecord,
  deleteMeetingRecord,
  findMeetingById,
  findMeetings,
  findUsersByIds,
  lockUserRecords,
  lockMeetingRecord,
  updateMeetingRecord,
  withUserLocks,
} from './meetingRepository.js';
import { findMeetingAttendeeIds } from './attendeeRepository.js';
import { assertNoSchedulingConflict, normalizeSchedule } from './conflictService.js';

function normalizePositiveId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${field} must be a positive integer`, 422, 'VALIDATION_ERROR', { field });
  }
  return id;
}

function normalizeTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) {
    throw new AppError('Meeting title is required', 422, 'VALIDATION_ERROR', { field: 'title' });
  }
  if (title.length > 200) {
    throw new AppError('Title cannot exceed 200 characters', 422, 'VALIDATION_ERROR', { field: 'title' });
  }
  return title;
}

export function normalizeAttendeeList(rawAttendees = []) {
  if (!Array.isArray(rawAttendees) || rawAttendees.length === 0) {
    throw new AppError('At least one attendee is required', 422, 'VALIDATION_ERROR', {
      field: 'attendees',
    });
  }

  const seenUserIds = new Set();
  return rawAttendees.map((attendee) => {
    const item = typeof attendee === 'number' ? { user_id: attendee } : attendee;
    const userId = normalizePositiveId(item?.user_id, 'attendees.user_id');
    if (seenUserIds.has(userId)) {
      throw new AppError(`Duplicate attendee user_id: ${userId}`, 422, 'VALIDATION_ERROR', {
        field: 'attendees',
      });
    }
    if (item?.required !== undefined && typeof item.required !== 'boolean') {
      throw new AppError('required must be a boolean', 422, 'VALIDATION_ERROR', {
        field: 'attendees.required',
      });
    }
    seenUserIds.add(userId);
    return { user_id: userId, required: item.required ?? true };
  });
}

async function assertUsersExist(userIds, queryable) {
  const uniqueIds = [...new Set(userIds)];
  const existingIds = await findUsersByIds(uniqueIds, queryable);
  const missingId = uniqueIds.find((id) => !existingIds.includes(id));
  if (missingId !== undefined) {
    throw new AppError(`User with id ${missingId} was not found`, 404, 'USER_NOT_FOUND', {
      user_id: missingId,
    });
  }
}

export async function createMeeting(payload = {}) {
  const title = normalizeTitle(payload.title);
  const organizerId = normalizePositiveId(payload.organizer_id, 'organizer_id');
  const { start_time, end_time } = normalizeSchedule(payload.start_time, payload.end_time);
  const attendees = normalizeAttendeeList(payload.attendees ?? []);
  const description = payload.description == null ? '' : String(payload.description).trim();
  const status = payload.status == null ? 'scheduled' : String(payload.status).trim();

  if (!status || status.length > 50) {
    throw new AppError('status must be between 1 and 50 characters', 422, 'VALIDATION_ERROR', {
      field: 'status',
    });
  }

  return withUserLocks([organizerId, ...attendees.map(({ user_id }) => user_id)], async (client) => {
    await assertUsersExist([organizerId, ...attendees.map(({ user_id }) => user_id)], client);
    if (status !== 'cancelled') {
      await assertNoSchedulingConflict({
        start_time,
        end_time,
        attendee_ids: [organizerId, ...attendees.map(({ user_id }) => user_id)],
      }, client);
    }
    const meeting = await createMeetingRecord({
      title,
      description,
      start_time,
      end_time,
      organizer_id: organizerId,
      status,
      attendees,
    }, client);
    const savedMeeting = await findMeetingById(meeting.id, client);
    if (!savedMeeting) {
      throw new AppError('Meeting could not be loaded after creation', 500, 'MEETING_CREATE_FAILED');
    }
    return savedMeeting;
  });
}

export async function listMeetings(page = 1, limit = 20) {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError('page must be a positive integer', 422, 'VALIDATION_ERROR', { field: 'page' });
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new AppError('limit must be an integer between 1 and 100', 422, 'VALIDATION_ERROR', {
      field: 'limit',
    });
  }

  const { meetings, total } = await findMeetings({
    limit: parsedLimit,
    offset: (parsedPage - 1) * parsedLimit,
  });
  return {
    data: meetings,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
}

export async function getMeetingById(id) {
  const parsedId = normalizePositiveId(id, 'id');
  const meeting = await findMeetingById(parsedId);
  if (!meeting) {
    throw new AppError(`Meeting with id ${parsedId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: parsedId,
    });
  }
  return meeting;
}

export async function updateMeeting(id, payload = {}) {
  const meetingId = normalizePositiveId(id, 'id');
  const existing = await findMeetingById(meetingId);
  if (!existing) {
    throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: meetingId,
    });
  }

  const update = {
    title: payload.title === undefined ? existing.title : normalizeTitle(payload.title),
    description: payload.description === undefined
      ? existing.description
      : payload.description == null ? '' : String(payload.description).trim(),
    start_time: payload.start_time === undefined ? existing.start_time : payload.start_time,
    end_time: payload.end_time === undefined ? existing.end_time : payload.end_time,
    status: payload.status === undefined ? existing.status : String(payload.status).trim(),
  };
  const schedule = normalizeSchedule(update.start_time, update.end_time);
  update.start_time = schedule.start_time;
  update.end_time = schedule.end_time;

  if (!update.status || update.status.length > 50) {
    throw new AppError('status must be between 1 and 50 characters', 422, 'VALIDATION_ERROR', {
      field: 'status',
    });
  }

  const participantIds = [
    existing.organizer_id,
    ...(await findMeetingAttendeeIds(meetingId)),
  ];

  return withUserLocks(participantIds, async (client) => {
    if (!(await lockMeetingRecord(meetingId, client))) {
      throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: meetingId,
      });
    }
    const currentMeeting = await findMeetingById(meetingId, client);
    if (!currentMeeting) {
      throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: meetingId,
      });
    }
    const currentAttendeeIds = await findMeetingAttendeeIds(meetingId, client);
    const currentParticipantIds = [currentMeeting.organizer_id, ...currentAttendeeIds];
    await lockUserRecords(currentParticipantIds, client);

    if (update.status !== 'cancelled') {
      await assertNoSchedulingConflict({
        ...schedule,
        attendee_ids: currentParticipantIds,
        exclude_meeting_id: meetingId,
      }, client);
    }
    const updated = await updateMeetingRecord(meetingId, update, client);
    if (!updated) {
      throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: meetingId,
      });
    }
    return findMeetingById(meetingId, client);
  });
}

export async function deleteMeeting(id) {
  const meetingId = normalizePositiveId(id, 'id');
  const existing = await findMeetingById(meetingId);
  if (!existing) {
    throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: meetingId,
    });
  }
  const participantIds = [existing.organizer_id, ...(await findMeetingAttendeeIds(meetingId))];

  return withUserLocks(participantIds, async (client) => {
    if (!(await lockMeetingRecord(meetingId, client))) {
      throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: meetingId,
      });
    }
    const deleted = await deleteMeetingRecord(meetingId, client);
    if (!deleted) {
      throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: meetingId,
      });
    }
  });
}

export default {
  createMeeting,
  deleteMeeting,
  getMeetingById,
  listMeetings,
  normalizeAttendeeList,
  updateMeeting,
};
