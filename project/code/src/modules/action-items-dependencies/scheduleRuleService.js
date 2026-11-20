import AppError from '../../common/errors/AppError.js';
// Meeting data and schedule writes go through Meeting Management's services, never its tables.
import { getMeetingById } from '../meetings/meetingService.js';
import {
  applyScheduleChanges,
  lockMeetingsForScheduling,
  notifyScheduleChanges,
} from '../meetings/scheduleChangeService.js';
import {
  findDependencyGraph,
  findDownstreamDependencies,
  findUpstreamDependencies,
  withDependencyGraphLock,
} from './dependencyRepository.js';
import {
  describeDependencyStatus,
  findConnectedMeetingIds,
  planScheduleChanges,
  topologicallySortMeetings,
} from './scheduleRules.js';

function toMeetingId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('id must be a positive integer', 422, 'VALIDATION_ERROR', { field: 'id' });
  }
  return id;
}

// The changes the dependency graph requires after rootMeetingId changed. Runs inside the
// caller's transaction (queryable), which must hold the dependency-graph advisory lock.
export async function planDependencyChanges(rootMeetingId, queryable, { reason = 'dependency_recalculation' } = {}) {
  const dependencies = await findDependencyGraph(queryable);
  const meetingIds = findConnectedMeetingIds(rootMeetingId, dependencies);
  topologicallySortMeetings(meetingIds, dependencies); // fail fast on a cycle, before locking
  const meetings = await lockMeetingsForScheduling([...meetingIds], queryable);
  const meetingsById = new Map(meetings.map((meeting) => [Number(meeting.id), meeting]));
  if (!meetingsById.has(Number(rootMeetingId))) {
    throw new AppError(`Meeting with id ${rootMeetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: Number(rootMeetingId),
    });
  }
  return planScheduleChanges({ meetingIds, dependencies, meetingsById, reason });
}

// GET /api/meetings/:id/dependency-status
export async function getMeetingDependencyStatus(meetingIdValue) {
  const meetingId = toMeetingId(meetingIdValue);
  const meeting = await getMeetingById(meetingId); // 404 if missing
  const [parentEdges, childEdges] = await Promise.all([
    findUpstreamDependencies(meetingId),
    findDownstreamDependencies(meetingId),
  ]);
  const neighborIds = [...new Set([
    ...parentEdges.map((edge) => Number(edge.upstream_meeting_id)),
    ...childEdges.map((edge) => Number(edge.meeting_id)),
  ])];
  const neighbors = await Promise.all(neighborIds.map((id) => getMeetingById(id)));
  const neighborsById = new Map(neighbors.map((item) => [Number(item.id), {
    id: item.id,
    title: item.title,
    start_time: item.start_time,
    end_time: item.end_time,
    organizer_id: item.organizer_id,
    status: item.status,
  }]));
  return describeDependencyStatus(meeting, parentEdges, childEdges, neighborsById);
}

// POST /api/meetings/:id/recalculate-dependencies
export async function recalculateMeetingDependencies(meetingIdValue) {
  const meetingId = toMeetingId(meetingIdValue);
  await getMeetingById(meetingId); // 404 if missing
  const changes = await withDependencyGraphLock(async (client) => {
    const planned = await planDependencyChanges(meetingId, client);
    return applyScheduleChanges(planned, client);
  });
  await notifyScheduleChanges(changes);
  return changes;
}

export default {
  getMeetingDependencyStatus,
  planDependencyChanges,
  recalculateMeetingDependencies,
};
