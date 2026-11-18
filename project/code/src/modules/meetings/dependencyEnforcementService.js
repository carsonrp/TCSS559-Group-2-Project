import AppError from '../../common/errors/AppError.js';
import {
  findDependencyGraph,
  findMeetingById,
  findMeetingParticipants,
  findMeetingsByIds,
  insertScheduleChange,
  lockMeetingRecords,
  lockUserRecords,
  updateMeetingSchedule,
  withUserLocks,
} from './meetingRepository.js';
import { assertNoSchedulingConflict } from './conflictService.js';
import { findMeetingAttendeeIds } from './attendeeRepository.js';
import { sendDependencyBlockedEmail, sendRescheduledEmail } from '../notifications/notification.service.js';
import { updateCalendarEvent } from '../calendar/calendarClient.js';
import { runExternalEffects } from '../../common/services/runExternalEffects.js';

const HOUR_MS = 60 * 60 * 1000;

export function topologicallySortMeetings(meetingIds, dependencies) {
  const ids = [...new Set([...meetingIds].map(Number))];
  const indegree = new Map(ids.map((id) => [id, 0]));
  const children = new Map(ids.map((id) => [id, []]));

  for (const edge of dependencies) {
    const parentId = Number(edge.upstream_meeting_id);
    const childId = Number(edge.meeting_id);
    if (!indegree.has(parentId) || !indegree.has(childId)) {
      continue;
    }
    children.get(parentId).push(childId);
    indegree.set(childId, indegree.get(childId) + 1);
  }

  const ready = ids.filter((id) => indegree.get(id) === 0);
  const ordered = [];
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index];
    ordered.push(id);
    for (const childId of children.get(id)) {
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) {
        ready.push(childId);
      }
    }
  }

  if (ordered.length !== ids.length) {
    throw new AppError('Dependency cycle detected', 409, 'DEPENDENCY_CYCLE_DETECTED');
  }
  return ordered;
}

function isBlockedParent(meeting) {
  return meeting.status === 'cancelled' || meeting.status === 'blocked';
}

export async function enforceMeetingDependencies(rootMeetingId, queryable, { reason = 'dependency_recalculation' } = {}) {
  const dependencies = await findDependencyGraph(queryable);
  const involvedIds = new Set([Number(rootMeetingId)]);
  const childrenByParent = new Map();
  const parentsByChild = new Map();
  for (const dependency of dependencies) {
    const parentId = Number(dependency.upstream_meeting_id);
    const childId = Number(dependency.meeting_id);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(dependency);
    if (!parentsByChild.has(childId)) {
      parentsByChild.set(childId, []);
    }
    parentsByChild.get(childId).push(dependency);
  }

  const queue = [Number(rootMeetingId)];
  while (queue.length > 0) {
    const meetingId = queue.shift();
    const adjacent = [
      ...(childrenByParent.get(meetingId) ?? []).map((edge) => Number(edge.meeting_id)),
      ...(parentsByChild.get(meetingId) ?? []).map((edge) => Number(edge.upstream_meeting_id)),
    ];
    for (const adjacentId of adjacent) {
      if (!involvedIds.has(adjacentId)) {
        involvedIds.add(adjacentId);
        queue.push(adjacentId);
      }
    }
  }

  topologicallySortMeetings(involvedIds, dependencies);
  const meetings = await findMeetingsByIds([...involvedIds], queryable);
  const meetingsById = new Map(meetings.map((meeting) => [Number(meeting.id), meeting]));
  if (!meetingsById.has(Number(rootMeetingId))) {
    throw new AppError(`Meeting with id ${rootMeetingId} was not found`, 404, 'MEETING_NOT_FOUND');
  }

  const participants = await findMeetingParticipants([...involvedIds], queryable);
  await lockUserRecords([...new Set(participants.map((row) => row.user_id))].sort((a, b) => a - b), queryable);
  await lockMeetingRecords([...involvedIds].sort((a, b) => a - b), queryable);

  const ordered = topologicallySortMeetings(involvedIds, dependencies);
  const updatedMeetings = [];
  for (const childId of ordered) {
    const child = meetingsById.get(childId);
    const parentEdges = parentsByChild.get(childId) ?? [];
    if (!child || parentEdges.length === 0 || child.status === 'cancelled') {
      continue;
    }

    const before = {
      start_time: child.start_time,
      end_time: child.end_time,
      status: child.status,
    };
    const parentMeetings = parentEdges.map((edge) => ({
      meeting: meetingsById.get(Number(edge.upstream_meeting_id)),
      edge,
    }));
    const blockedParent = parentMeetings.find(({ meeting }) => isBlockedParent(meeting));
    let changeReason;
    if (blockedParent) {
      if (child.status !== 'blocked') {
        child.status = 'blocked';
        changeReason = `Blocked because parent meeting ${blockedParent.meeting.id} is ${blockedParent.meeting.status}`;
      }
    } else {
      const requiredStart = Math.max(...parentMeetings.map(({ meeting, edge }) =>
        new Date(meeting.end_time).getTime() + Number(edge.min_gap_hours) * HOUR_MS
      ));
      if (new Date(child.start_time).getTime() < requiredStart) {
        const duration = new Date(child.end_time).getTime() - new Date(child.start_time).getTime();
        child.start_time = new Date(requiredStart);
        child.end_time = new Date(requiredStart + duration);
        changeReason = reason;
      }
      if (child.status === 'blocked') {
        child.status = 'scheduled';
        changeReason = changeReason ?? 'Dependency requirements are now met';
      }
    }

    if (!changeReason) {
      continue;
    }

    await updateMeetingSchedule(childId, child, queryable);
    await insertScheduleChange({
      meeting_id: childId,
      old_start_time: before.start_time,
      old_end_time: before.end_time,
      new_start_time: child.start_time,
      new_end_time: child.end_time,
      old_status: before.status,
      new_status: child.status,
      reason: changeReason,
    }, queryable);
    updatedMeetings.push({
      ...child,
      previous_start_time: before.start_time,
      previous_end_time: before.end_time,
      previous_status: before.status,
      reason: changeReason,
    });
  }

  for (const child of updatedMeetings) {
    if (child.status === 'blocked' || child.status === 'cancelled') {
      continue;
    }
    const attendeeIds = participants
      .filter((participant) => Number(participant.meeting_id) === Number(child.id))
      .map((participant) => Number(participant.user_id));
    const organizer = meetingsById.get(Number(child.id)).organizer_id;
    await assertNoSchedulingConflict({
      start_time: child.start_time,
      end_time: child.end_time,
      attendee_ids: [...new Set([Number(organizer), ...attendeeIds])],
      exclude_meeting_id: child.id,
    }, queryable);
  }

  return updatedMeetings;
}

export async function getMeetingDependencyStatus(meetingId) {
  const parsedId = Number(meetingId);
  const meeting = await findMeetingById(parsedId);
  if (!meeting) {
    throw new AppError(`Meeting with id ${parsedId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: parsedId,
    });
  }
  const dependencies = await findDependencyGraph();
  const parentEdges = dependencies.filter((edge) => Number(edge.meeting_id) === parsedId);
  const childEdges = dependencies.filter((edge) => Number(edge.upstream_meeting_id) === parsedId);
  const neighborIds = [...new Set([
    ...parentEdges.map((edge) => Number(edge.upstream_meeting_id)),
    ...childEdges.map((edge) => Number(edge.meeting_id)),
  ])];
  const neighbors = await findMeetingsByIds(neighborIds);
  const neighborsById = new Map(neighbors.map((item) => [Number(item.id), item]));
  const parentMeetings = parentEdges.map((edge) => ({
    ...neighborsById.get(Number(edge.upstream_meeting_id)),
    min_gap_hours: edge.min_gap_hours,
  }));
  const childMeetings = childEdges.map((edge) => ({
    ...neighborsById.get(Number(edge.meeting_id)),
    min_gap_hours: edge.min_gap_hours,
  }));
  const dependencyViolations = parentEdges.flatMap((edge) => {
    const parent = neighborsById.get(Number(edge.upstream_meeting_id));
    const earliest = new Date(new Date(parent.end_time).getTime() + Number(edge.min_gap_hours) * HOUR_MS);
    if (isBlockedParent(parent) || new Date(meeting.start_time) < earliest) {
      return [{
        parentMeetingId: parent.id,
        parentStatus: parent.status,
        earliestAllowedStart: earliest.toISOString(),
        actualStart: new Date(meeting.start_time).toISOString(),
      }];
    }
    return [];
  });

  return {
    meetingId: parsedId,
    blocked: meeting.status === 'blocked' || dependencyViolations.length > 0,
    parentMeetings,
    childMeetings,
    dependencyViolations,
  };
}

export async function recalculateMeetingDependencies(meetingId) {
  const parsedId = Number(meetingId);
  const meeting = await findMeetingById(parsedId);
  if (!meeting) {
    throw new AppError(`Meeting with id ${parsedId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: parsedId,
    });
  }
  const userIds = [meeting.organizer_id, ...(await findMeetingAttendeeIds(parsedId))];
  const updatedMeetings = await withUserLocks(userIds, async (client) => {
    const locked = await client.query('SELECT id FROM meetings WHERE id = $1 FOR UPDATE', [parsedId]);
    if (!locked.rowCount) {
      throw new AppError(`Meeting with id ${parsedId} was not found`, 404, 'MEETING_NOT_FOUND', {
        meeting_id: parsedId,
      });
    }
    return enforceMeetingDependencies(parsedId, client);
  }, { dependencyGraph: true });

  const effects = updatedMeetings.map((change) => async () => {
    const fullMeeting = await findMeetingById(change.id);
    await updateCalendarEvent(fullMeeting);
    if (change.status === 'blocked') {
      return sendDependencyBlockedEmail(fullMeeting, change.reason, change.previous_start_time);
    }
    return sendRescheduledEmail(fullMeeting, change.previous_start_time, change.start_time, change.reason);
  });
  await runExternalEffects(effects);
  return updatedMeetings;
}

export default {
  enforceMeetingDependencies,
  getMeetingDependencyStatus,
  recalculateMeetingDependencies,
  topologicallySortMeetings,
};
