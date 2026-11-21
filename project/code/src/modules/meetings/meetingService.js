import AppError from '../../common/errors/AppError.js';
import {
  createMeetingRecord,
  deleteMeetingRecord,
  findMeetingById,
  findMeetings,
  findUsersByIds,
  insertScheduleChange,
  lockUserRecords,
  lockMeetingRecord,
  updateMeetingRecord,
  withUserLocks,
} from './meetingRepository.js';
import { findMeetingAttendeeIds } from './attendeeRepository.js';
import { assertNoSchedulingConflict, normalizeSchedule } from './conflictService.js';
import { enforceMeetingDependencies } from './dependencyEnforcementService.js';
import {
  sendMeetingCreatedEmail,
  sendMeetingDeletedEmail,
  sendMeetingUpdatedEmail,
  sendRescheduledEmail,
  sendDependencyBlockedEmail,
} from '../notifications/notificationClient.js';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '../calendar/calendarClient.js';
import { runExternalEffects } from '../../common/services/runExternalEffects.js';

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

function scheduleChanged(previous, next) {
  return new Date(previous.start_time).getTime() !== new Date(next.start_time).getTime()
    || new Date(previous.end_time).getTime() !== new Date(next.end_time).getTime();
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

  const meeting = await withUserLocks([organizerId, ...attendees.map(({ user_id }) => user_id)], async (client) => {
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
  await runExternalEffects([
    () => createCalendarEvent(meeting),
    () => sendMeetingCreatedEmail(meeting),
  ]);
  return meeting;
}

function normalizeTimestamp(value, fieldName) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError(`Invalid ${fieldName}`, 422, 'VALIDATION_ERROR', { field: fieldName });
  }
  return timestamp.toISOString();
}

// page/limit paginate; start/end filter to meetings overlapping that range.
// With start or end and no limit, every meeting in the range is returned.
export async function listMeetings({ page, limit, start, end } = {}) {
  const startTime = start ? normalizeTimestamp(start, 'start') : null;
  const endTime = end ? normalizeTimestamp(end, 'end') : null;
  const ranged = startTime !== null || endTime !== null;
  const paginate = limit !== undefined || page !== undefined || !ranged;

  const parsedPage = page === undefined ? 1 : Number(page);
  const parsedLimit = limit === undefined ? 20 : Number(limit);
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError('page must be a positive integer', 422, 'VALIDATION_ERROR', { field: 'page' });
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new AppError('limit must be an integer between 1 and 100', 422, 'VALIDATION_ERROR', {
      field: 'limit',
    });
  }

  const { meetings, total } = await findMeetings({
    limit: paginate ? parsedLimit : null,
    offset: paginate ? (parsedPage - 1) * parsedLimit : 0,
    start: startTime,
    end: endTime,
  });
  if (!paginate) {
    return { data: meetings };
  }
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

  const participantIds = [
    existing.organizer_id,
    ...(await findMeetingAttendeeIds(meetingId)),
  ];

  const result = await withUserLocks(participantIds, async (client) => {
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

    const transactionUpdate = {
      title: payload.title === undefined ? currentMeeting.title : normalizeTitle(payload.title),
      description: payload.description === undefined
        ? currentMeeting.description
        : payload.description == null ? '' : String(payload.description).trim(),
      start_time: payload.start_time === undefined ? currentMeeting.start_time : payload.start_time,
      end_time: payload.end_time === undefined ? currentMeeting.end_time : payload.end_time,
      status: payload.status === undefined ? currentMeeting.status : String(payload.status).trim(),
    };
    const transactionSchedule = normalizeSchedule(transactionUpdate.start_time, transactionUpdate.end_time);
    transactionUpdate.start_time = transactionSchedule.start_time;
    transactionUpdate.end_time = transactionSchedule.end_time;
    if (!transactionUpdate.status || transactionUpdate.status.length > 50) {
      throw new AppError('status must be between 1 and 50 characters', 422, 'VALIDATION_ERROR', {
        field: 'status',
      });
    }

    const updated = await updateMeetingRecord(meetingId, transactionUpdate, client);
    if (!updated) {
      throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: meetingId,
      });
    }
    if (scheduleChanged(currentMeeting, updated)) {
      await insertScheduleChange({
        meeting_id: meetingId,
        old_start_time: currentMeeting.start_time,
        old_end_time: currentMeeting.end_time,
        new_start_time: updated.start_time,
        new_end_time: updated.end_time,
        old_status: currentMeeting.status,
        new_status: updated.status,
        reason: 'Meeting updated',
      }, client);
    }
    const changes = await enforceMeetingDependencies(meetingId, client, {
      reason: scheduleChanged(currentMeeting, updated)
        ? 'Parent meeting rescheduled'
        : 'Dependency requirements recalculated after meeting update',
    });
    const savedMeeting = await findMeetingById(meetingId, client);
    if (savedMeeting.status !== 'cancelled' && savedMeeting.status !== 'blocked') {
      await assertNoSchedulingConflict({
        start_time: savedMeeting.start_time,
        end_time: savedMeeting.end_time,
        attendee_ids: currentParticipantIds,
        exclude_meeting_id: meetingId,
      }, client);
    }
    return { meeting: savedMeeting, dependencyChanges: changes, previousMeeting: currentMeeting };
  }, { dependencyGraph: true });
  const effects = [
    () => updateCalendarEvent(result.meeting),
    () => sendMeetingUpdatedEmail(result.meeting, result.previousMeeting),
  ];
  for (const change of result.dependencyChanges) {
    effects.push(async () => {
      const fullMeeting = await getMeetingById(change.id);
      await updateCalendarEvent(fullMeeting);
      if (change.status === 'blocked') {
        return sendDependencyBlockedEmail(fullMeeting, change.reason, change.previous_start_time);
      }
      return sendRescheduledEmail(fullMeeting, change.previous_start_time, change.start_time, change.reason);
    });
  }
  await runExternalEffects(effects);
  return result.meeting;
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

  await withUserLocks(participantIds, async (client) => {
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
  await runExternalEffects([
    () => deleteCalendarEvent(meetingId),
    () => sendMeetingDeletedEmail(existing),
  ]);
}

export default {
  createMeeting,
  deleteMeeting,
  getMeetingById,
  listMeetings,
  normalizeAttendeeList,
  updateMeeting,
};
