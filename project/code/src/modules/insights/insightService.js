import AppError from '../../common/errors/AppError.js';
import {
  findAttendeesForMeetings,
  findMeetingForInsights,
  findMeetingsInRange,
  findOverlappingMeetings,
} from './insightRepository.js';
import { computeMeetingInsights, computeSummary } from './insightCalculations.js';

function normalizeOptionalTimestamp(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError(`Invalid ${fieldName}`, 422, 'VALIDATION_ERROR', { field: fieldName });
  }

  return timestamp.toISOString();
}

export async function getInsightsSummary({ start, end } = {}) {
  const startTime = normalizeOptionalTimestamp(start, 'start');
  const endTime = normalizeOptionalTimestamp(end, 'end');

  if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
    throw new AppError('end must be after start', 422, 'VALIDATION_ERROR', { field: 'end' });
  }

  const meetings = await findMeetingsInRange({ start: startTime, end: endTime });
  const attendees = await findAttendeesForMeetings(meetings.map((m) => m.id));

  return computeSummary({ meetings, attendees, start: startTime, end: endTime });
}

export async function getMeetingInsights(id) {
  const meetingId = Number(id);

  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    throw new AppError('Meeting id must be a positive integer', 422, 'VALIDATION_ERROR', { field: 'id' });
  }

  const meeting = await findMeetingForInsights(meetingId);

  if (!meeting) {
    throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: meetingId,
    });
  }

  const [attendees, overlaps] = await Promise.all([
    findAttendeesForMeetings([meetingId]),
    findOverlappingMeetings(meetingId),
  ]);

  return computeMeetingInsights({ meeting, attendees, overlaps });
}

export default { getInsightsSummary, getMeetingInsights };
