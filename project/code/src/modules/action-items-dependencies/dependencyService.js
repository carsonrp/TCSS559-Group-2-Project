import AppError from '../../common/errors/AppError.js';
// Meeting data comes through Meeting Management's service, not its tables.
import { getMeetingById } from '../meetings/meetingService.js';
import {
  dependencyExists,
  findDownstreamDependencies,
  findUpstreamDependencies,
  insertDependency,
  withDependencyGraphLock,
  wouldCreateCycle,
} from './dependencyRepository.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_GAP_HOURS = 24 * 365;

export function toPositiveId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${field} must be a positive integer`, 422, 'VALIDATION_ERROR', { field });
  }
  return id;
}

export function toAsOf(value) {
  if (value === undefined || value === null || value === '') {
    return new Date();
  }
  const asOf = new Date(value);
  if (Number.isNaN(asOf.getTime())) {
    throw new AppError('as_of must be a valid ISO 8601 date-time', 422, 'VALIDATION_ERROR', {
      field: 'as_of',
    });
  }
  return asOf;
}

function toGapHours(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  const gap = Number(value);
  if (!Number.isInteger(gap) || gap < 0 || gap > MAX_GAP_HOURS) {
    throw new AppError(`min_gap_hours must be an integer from 0 to ${MAX_GAP_HOURS}`, 422, 'VALIDATION_ERROR', {
      field: 'min_gap_hours',
    });
  }
  return gap;
}

export function earliestAllowedStart(upstream, minGapHours) {
  return new Date(new Date(upstream.end_time).getTime() + minGapHours * HOUR_MS);
}

// satisfied: order holds and the upstream meeting has ended
// pending:   order holds but the upstream meeting has not happened yet
// violated:  the meeting starts too early, or the upstream meeting was cancelled
export function dependencyStatus(meeting, upstream, minGapHours, asOf = new Date()) {
  if (upstream.status === 'cancelled') {
    return 'violated';
  }
  if (new Date(meeting.start_time) < earliestAllowedStart(upstream, minGapHours)) {
    return 'violated';
  }
  if (new Date(upstream.end_time) > asOf) {
    return 'pending';
  }
  return 'satisfied';
}

export async function addDependency(meetingIdValue, payload = {}) {
  const meetingId = toPositiveId(meetingIdValue, 'id');
  const upstreamMeetingId = toPositiveId(payload.upstream_meeting_id, 'upstream_meeting_id');
  const minGapHours = toGapHours(payload.min_gap_hours);

  // 404 if either meeting does not exist
  const meeting = await getMeetingById(meetingId);
  const upstream = await getMeetingById(upstreamMeetingId);

  if (meetingId === upstreamMeetingId) {
    throw new AppError('A meeting cannot depend on itself', 409, 'SELF_DEPENDENCY', {
      meeting_id: meetingId,
    });
  }

  return withDependencyGraphLock(async (client) => {
    if (await dependencyExists(meetingId, upstreamMeetingId, client)) {
      throw new AppError('This dependency already exists', 409, 'DUPLICATE_DEPENDENCY', {
        meeting_id: meetingId,
        upstream_meeting_id: upstreamMeetingId,
      });
    }

    if (await wouldCreateCycle(meetingId, upstreamMeetingId, client)) {
      throw new AppError(
        `Meeting ${upstreamMeetingId} already depends on meeting ${meetingId}; adding this would create a cycle`,
        409,
        'DEPENDENCY_CYCLE',
        { meeting_id: meetingId, upstream_meeting_id: upstreamMeetingId }
      );
    }

    const earliest = earliestAllowedStart(upstream, minGapHours);
    if (new Date(meeting.start_time) < earliest) {
      throw new AppError(
        'The meeting starts before the upstream meeting ends plus the minimum gap',
        422,
        'DEPENDENCY_ORDER_VIOLATION',
        {
          meeting_start_time: meeting.start_time,
          upstream_end_time: upstream.end_time,
          min_gap_hours: minGapHours,
          earliest_allowed_start: earliest.toISOString(),
        }
      );
    }

    const dependency = await insertDependency(
      { meeting_id: meetingId, upstream_meeting_id: upstreamMeetingId, min_gap_hours: minGapHours },
      client
    );
    return { ...dependency, status: dependencyStatus(meeting, upstream, minGapHours) };
  });
}

function summarizeMeeting(meeting) {
  return {
    id: meeting.id,
    title: meeting.title,
    start_time: meeting.start_time,
    end_time: meeting.end_time,
    status: meeting.status,
  };
}

// Upstream dependencies of one meeting, each with its upstream meeting and status.
export async function loadUpstream(meeting, asOf) {
  const rows = await findUpstreamDependencies(meeting.id);
  return Promise.all(
    rows.map(async (row) => {
      const upstream = await getMeetingById(row.upstream_meeting_id);
      return {
        dependency_id: row.id,
        min_gap_hours: row.min_gap_hours,
        upstream: summarizeMeeting(upstream),
        status: dependencyStatus(meeting, upstream, row.min_gap_hours, asOf),
      };
    })
  );
}

export async function listDependencies(meetingIdValue, asOfValue) {
  const meetingId = toPositiveId(meetingIdValue, 'id');
  const asOf = toAsOf(asOfValue);
  const meeting = await getMeetingById(meetingId);

  const upstream = await loadUpstream(meeting, asOf);
  const downstreamRows = await findDownstreamDependencies(meetingId);
  const downstream = await Promise.all(
    downstreamRows.map(async (row) => {
      const later = await getMeetingById(row.meeting_id);
      return {
        dependency_id: row.id,
        min_gap_hours: row.min_gap_hours,
        meeting: summarizeMeeting(later),
        status: dependencyStatus(later, meeting, row.min_gap_hours, asOf),
      };
    })
  );

  return { meeting: summarizeMeeting(meeting), upstream, downstream };
}

export default { addDependency, dependencyStatus, listDependencies };
