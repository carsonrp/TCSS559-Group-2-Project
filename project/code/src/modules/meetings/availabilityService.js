import AppError from '../../common/errors/AppError.js';
import {
  createAvailabilitySlot,
  deleteAvailabilitySlot,
  findAvailabilityByUserId,
  findAvailabilityByUserIds,
  findExistingUserIds,
} from './availabilityRepository.js';
import { normalizeAttendeeIds } from './conflictService.js';

function parseId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${field} must be a positive integer`, 422, 'VALIDATION_ERROR', { field });
  }
  return id;
}

function normalizeSlot(start, end) {
  const availableStart = new Date(start);
  const availableEnd = new Date(end);
  if (Number.isNaN(availableStart.getTime())) {
    throw new AppError('Invalid available_start', 422, 'VALIDATION_ERROR', {
      field: 'available_start',
    });
  }
  if (Number.isNaN(availableEnd.getTime())) {
    throw new AppError('Invalid available_end', 422, 'VALIDATION_ERROR', {
      field: 'available_end',
    });
  }
  if (availableEnd <= availableStart) {
    throw new AppError('available_end must be after available_start', 422, 'VALIDATION_ERROR', {
      field: 'available_end',
    });
  }
  return {
    start: availableStart.toISOString(),
    end: availableEnd.toISOString(),
  };
}

export async function createAvailability(userId, payload = {}) {
  const id = parseId(userId, 'id');
  const slot = normalizeSlot(payload.available_start, payload.available_end);
  const existingUsers = await findExistingUserIds([id]);
  if (!existingUsers.includes(id)) {
    throw new AppError(`User with id ${id} was not found`, 404, 'USER_NOT_FOUND', {
      user_id: id,
    });
  }
  return createAvailabilitySlot(id, slot.start, slot.end);
}

export async function listAvailability(userId) {
  const id = parseId(userId, 'id');
  const existingUsers = await findExistingUserIds([id]);
  if (!existingUsers.includes(id)) {
    throw new AppError(`User with id ${id} was not found`, 404, 'USER_NOT_FOUND', {
      user_id: id,
    });
  }
  return findAvailabilityByUserId(id);
}

export async function deleteAvailability(id) {
  const slotId = parseId(id, 'id');
  if (!(await deleteAvailabilitySlot(slotId))) {
    throw new AppError(`Availability slot with id ${slotId} was not found`, 404, 'AVAILABILITY_NOT_FOUND', {
      availability_id: slotId,
    });
  }
}

function mergeWindows(windows) {
  const sorted = windows.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (!last || window.start > last.end) {
      merged.push({ ...window });
    } else if (window.end > last.end) {
      last.end = window.end;
    }
  }
  return merged;
}

export function calculateCommonAvailability(userIds, availabilityRows) {
  if (!userIds.length) {
    return [];
  }

  const byUser = new Map(userIds.map((id) => [id, []]));
  for (const row of availabilityRows) {
    const userWindows = byUser.get(Number(row.user_id));
    if (userWindows) {
      const start = new Date(row.available_start).getTime();
      const end = new Date(row.available_end).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        userWindows.push({ start, end });
      }
    }
  }

  let common = byUser.get(userIds[0]).map((window) => ({ ...window }));
  for (const userId of userIds.slice(1)) {
    const userWindows = byUser.get(userId);
    const overlaps = [];
    for (const candidate of common) {
      for (const window of userWindows) {
        const start = Math.max(candidate.start, window.start);
        const end = Math.min(candidate.end, window.end);
        if (start < end) {
          overlaps.push({ start, end });
        }
      }
    }
    common = mergeWindows(overlaps);
    if (common.length === 0) {
      break;
    }
  }

  return mergeWindows(common).map((window) => ({
    start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(),
  }));
}

export async function findCommonAvailability(rawAttendees) {
  const attendeeIds = normalizeAttendeeIds(rawAttendees);
  const existingUsers = await findExistingUserIds(attendeeIds);
  const missingId = attendeeIds.find((id) => !existingUsers.includes(id));
  if (missingId !== undefined) {
    throw new AppError(`User with id ${missingId} was not found`, 404, 'USER_NOT_FOUND', {
      user_id: missingId,
    });
  }
  const rows = await findAvailabilityByUserIds(attendeeIds);
  return calculateCommonAvailability(attendeeIds, rows);
}

export { normalizeSlot };

export default {
  calculateCommonAvailability,
  createAvailability,
  deleteAvailability,
  findCommonAvailability,
  listAvailability,
};
