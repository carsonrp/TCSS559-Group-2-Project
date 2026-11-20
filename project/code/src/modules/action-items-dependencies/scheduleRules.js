import AppError from '../../common/errors/AppError.js';

// Pure dependency-schedule rules. No database access, so they are unit-tested directly.
// A dependency edge is { meeting_id, upstream_meeting_id, min_gap_hours }:
// meeting_id may start only after upstream_meeting_id ends, plus min_gap_hours.

const HOUR_MS = 60 * 60 * 1000;

function isBlockedParent(meeting) {
  return meeting.status === 'cancelled' || meeting.status === 'blocked';
}

// Orders meetings so every upstream meeting comes before the meetings that depend on it.
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

// Every meeting linked to the root through dependencies, in either direction.
export function findConnectedMeetingIds(rootMeetingId, dependencies) {
  const neighbors = new Map();
  const link = (a, b) => {
    if (!neighbors.has(a)) {
      neighbors.set(a, []);
    }
    neighbors.get(a).push(b);
  };
  for (const edge of dependencies) {
    const parentId = Number(edge.upstream_meeting_id);
    const childId = Number(edge.meeting_id);
    link(parentId, childId);
    link(childId, parentId);
  }

  const connected = new Set([Number(rootMeetingId)]);
  const queue = [Number(rootMeetingId)];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const next of neighbors.get(id) ?? []) {
      if (!connected.has(next)) {
        connected.add(next);
        queue.push(next);
      }
    }
  }
  return connected;
}

// Works out which meetings must change so every dependency holds. Returns one entry per
// changed meeting with its new times and status and the previous ones. Writes nothing:
// Meeting Management applies the plan to its own tables.
//   - A meeting whose upstream meeting is cancelled or blocked becomes 'blocked'.
//   - A meeting that starts before its latest upstream end + gap moves to that time,
//     keeping its length.
//   - A blocked meeting whose upstream meetings are fine again returns to 'scheduled'.
export function planScheduleChanges({ meetingIds, dependencies, meetingsById, reason }) {
  const parentsByChild = new Map();
  for (const edge of dependencies) {
    const childId = Number(edge.meeting_id);
    if (!parentsByChild.has(childId)) {
      parentsByChild.set(childId, []);
    }
    parentsByChild.get(childId).push(edge);
  }

  // Work on copies so the caller's meeting rows are not modified.
  const current = new Map([...meetingsById].map(([id, meeting]) => [Number(id), { ...meeting }]));
  const changes = [];

  for (const childId of topologicallySortMeetings(meetingIds, dependencies)) {
    const child = current.get(childId);
    const parentEdges = (parentsByChild.get(childId) ?? [])
      .filter((edge) => current.has(Number(edge.upstream_meeting_id)));
    if (!child || parentEdges.length === 0 || child.status === 'cancelled') {
      continue;
    }

    const before = { start_time: child.start_time, end_time: child.end_time, status: child.status };
    const parents = parentEdges.map((edge) => ({ meeting: current.get(Number(edge.upstream_meeting_id)), edge }));
    const blockedParent = parents.find(({ meeting }) => isBlockedParent(meeting));
    let changeReason;

    if (blockedParent) {
      if (child.status !== 'blocked') {
        child.status = 'blocked';
        changeReason = `Blocked because parent meeting ${blockedParent.meeting.id} is ${blockedParent.meeting.status}`;
      }
    } else {
      const requiredStart = Math.max(...parents.map(({ meeting, edge }) =>
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

    if (changeReason) {
      changes.push({
        ...child,
        previous_start_time: before.start_time,
        previous_end_time: before.end_time,
        previous_status: before.status,
        reason: changeReason,
      });
    }
  }
  return changes;
}

// Read-only check of one meeting against its upstream and downstream meetings.
export function describeDependencyStatus(meeting, parentEdges, childEdges, neighborsById) {
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
    meetingId: Number(meeting.id),
    blocked: meeting.status === 'blocked' || dependencyViolations.length > 0,
    parentMeetings,
    childMeetings,
    dependencyViolations,
  };
}

export default {
  describeDependencyStatus,
  findConnectedMeetingIds,
  planScheduleChanges,
  topologicallySortMeetings,
};
