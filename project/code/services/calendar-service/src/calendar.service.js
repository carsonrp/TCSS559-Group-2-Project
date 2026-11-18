import * as repository from './calendar.repository.js';
import { ServiceError } from './errors.js';

function parseId(value, field = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ServiceError(`${field} must be a positive integer`, 422, 'VALIDATION_ERROR');
  }
  return id;
}

function validateEventUpdate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ServiceError('Event update body must be an object', 422, 'VALIDATION_ERROR');
  }
  const allowedFields = new Set(['start_time', 'end_time', 'status']);
  const keys = Object.keys(payload);
  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
    throw new ServiceError('Provide only start_time, end_time, or status', 422, 'VALIDATION_ERROR');
  }
  const normalized = { ...payload };
  for (const field of ['start_time', 'end_time']) {
    if (normalized[field] !== undefined) {
      const parsed = new Date(normalized[field]);
      if (typeof normalized[field] !== 'string' || Number.isNaN(parsed.getTime())) {
        throw new ServiceError(`${field} must be a valid ISO 8601 date-time`, 422, 'VALIDATION_ERROR');
      }
      normalized[field] = parsed.toISOString();
    }
  }
  if (normalized.status !== undefined &&
      (typeof normalized.status !== 'string' || normalized.status.trim().length === 0 || normalized.status.length > 50)) {
    throw new ServiceError('status must be a string between 1 and 50 characters', 422, 'VALIDATION_ERROR');
  }
  if (normalized.status !== undefined) {
    normalized.status = normalized.status.trim();
  }
  return normalized;
}

function mergeWindows(windows) {
  const sorted = windows.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (!last || window.start > last.end) {
      merged.push({ ...window });
    } else {
      last.end = Math.max(last.end, window.end);
    }
  }
  return merged;
}

export function intersectAvailability(userIds, availabilityRows) {
  const windowsByUser = new Map(userIds.map((id) => [id, []]));
  for (const row of availabilityRows) {
    const windows = windowsByUser.get(Number(row.user_id));
    const start = new Date(row.available_start).getTime();
    const end = new Date(row.available_end).getTime();
    if (windows && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      windows.push({ start, end });
    }
  }
  if (userIds.length === 0) {
    return [];
  }
  let common = windowsByUser.get(userIds[0]).map((window) => ({ ...window }));
  for (const userId of userIds.slice(1)) {
    const intersections = [];
    for (const left of common) {
      for (const right of windowsByUser.get(userId)) {
        const start = Math.max(left.start, right.start);
        const end = Math.min(left.end, right.end);
        if (start < end) {
          intersections.push({ start, end });
        }
      }
    }
    common = mergeWindows(intersections);
    if (common.length === 0) {
      return [];
    }
  }
  return mergeWindows(common);
}

export function subtractBusyTimes(available, busyTimes) {
  const busy = mergeWindows(busyTimes.map((item) => ({
    start: new Date(item.start_time).getTime(),
    end: new Date(item.end_time).getTime(),
  })).filter((window) => Number.isFinite(window.start) && Number.isFinite(window.end) && window.end > window.start));
  const slots = [];
  for (const window of available) {
    let cursor = window.start;
    for (const occupied of busy) {
      if (occupied.end <= cursor || occupied.start >= window.end) {
        continue;
      }
      if (occupied.start > cursor) {
        slots.push({ start: cursor, end: Math.min(occupied.start, window.end) });
      }
      cursor = Math.max(cursor, occupied.end);
      if (cursor >= window.end) {
        break;
      }
    }
    if (cursor < window.end) {
      slots.push({ start: cursor, end: window.end });
    }
  }
  return slots.map((slot) => ({
    start: new Date(slot.start).toISOString(),
    end: new Date(slot.end).toISOString(),
  }));
}

export async function createCalendarEvent(payload) {
  return repository.createEvent(repository.validateEvent(payload));
}

export async function getCalendarEvent(id) {
  const event = await repository.findEventById(parseId(id));
  if (!event) {
    throw new ServiceError(`Calendar event ${id} was not found`, 404, 'CALENDAR_EVENT_NOT_FOUND');
  }
  return event;
}

export async function updateCalendarEvent(id, payload) {
  const eventId = parseId(id);
  const current = await repository.findEventById(eventId);
  if (!current) {
    throw new ServiceError(`Calendar event ${id} was not found`, 404, 'CALENDAR_EVENT_NOT_FOUND');
  }
  const update = validateEventUpdate(payload);
  const start = new Date(update.start_time ?? current.start_time);
  const end = new Date(update.end_time ?? current.end_time);
  if (end <= start) {
    throw new ServiceError('end_time must be after start_time', 422, 'VALIDATION_ERROR');
  }
  return repository.updateEvent(eventId, update);
}

export async function updateCalendarEventByMeetingId(meetingId, payload) {
  const id = parseId(meetingId, 'meeting_id');
  const current = await repository.findEventByMeetingId(id);
  if (!current) {
    throw new ServiceError(`Calendar event for meeting ${meetingId} was not found`, 404, 'CALENDAR_EVENT_NOT_FOUND');
  }
  const update = validateEventUpdate(payload);
  if (new Date(update.end_time ?? current.end_time) <= new Date(update.start_time ?? current.start_time)) {
    throw new ServiceError('end_time must be after start_time', 422, 'VALIDATION_ERROR');
  }
  return repository.updateEventByMeetingId(id, update);
}

export async function deleteCalendarEvent(id) {
  if (!(await repository.deleteEvent(parseId(id)))) {
    throw new ServiceError(`Calendar event ${id} was not found`, 404, 'CALENDAR_EVENT_NOT_FOUND');
  }
}

export async function deleteCalendarEventByMeetingId(meetingId) {
  await repository.deleteEventByMeetingId(parseId(meetingId, 'meeting_id'));
}

export async function findAvailableSlots(rawUserIds) {
  const userIds = rawUserIds.map((value) => parseId(value, 'users'));
  if (userIds.length === 0 || new Set(userIds).size !== userIds.length) {
    throw new ServiceError('users must contain one or more distinct user ids', 422, 'VALIDATION_ERROR');
  }
  const existingUsers = await repository.findExistingUserIds(userIds);
  const missingId = userIds.find((id) => !existingUsers.includes(id));
  if (missingId !== undefined) {
    throw new ServiceError(`User ${missingId} was not found`, 404, 'USER_NOT_FOUND');
  }
  const [availability, busy] = await Promise.all([
    repository.findAvailabilityRows(userIds),
    repository.findBusyTimes(userIds),
  ]);
  return subtractBusyTimes(intersectAvailability(userIds, availability), busy);
}

export default {
  createCalendarEvent,
  deleteCalendarEvent,
  deleteCalendarEventByMeetingId,
  findAvailableSlots,
  getCalendarEvent,
  updateCalendarEvent,
  updateCalendarEventByMeetingId,
};
