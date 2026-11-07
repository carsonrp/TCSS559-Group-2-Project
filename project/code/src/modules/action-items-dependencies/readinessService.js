import { getMeetingById } from '../meetings/meetingService.js';
import { findPrerequisitesForMeeting } from './actionItemRepository.js';
import { loadUpstream, toAsOf, toPositiveId } from './dependencyService.js';

const INACTIVE_ITEM_STATUSES = new Set(['dropped', 'rejected']);

function describePrerequisite(prerequisite) {
  return {
    prerequisite_id: prerequisite.id,
    kind: prerequisite.kind,
    action_item_id: prerequisite.action_item_id ?? null,
    title: prerequisite.kind === 'action_item' ? prerequisite.item_description : prerequisite.title,
    owner_id: prerequisite.item_owner_id ?? null,
    required: prerequisite.required,
  };
}

function isComplete(prerequisite) {
  if (prerequisite.kind === 'action_item') {
    return prerequisite.item_status === 'done';
  }
  return prerequisite.done === true && Boolean(prerequisite.document_url);
}

/**
 * Readiness rules. Pure function: no database access, so it is unit-tested directly.
 *
 * - A violated upstream dependency            -> blocking (order_broken / upstream_cancelled)
 * - Required prerequisite done                -> complete
 * - Required, not done, due date passed       -> blocking (overdue, or missing for a document without a link)
 * - Required, not done, not yet due           -> at risk
 * - Optional, not done                        -> warning only
 * - Dropped prerequisites, or items dropped/rejected -> listed, not counted
 * The due date is the prerequisite's own, else its action item's, else the meeting start.
 * Status: not_ready if anything blocks, at_risk if anything is at risk, otherwise ready.
 */
export function evaluateReadiness({ meeting, dependencies = [], prerequisites = [], asOf = new Date() }) {
  const blocking = [];
  const atRisk = [];
  const warnings = [];
  const complete = [];
  const dropped = [];
  let required = 0;
  let requiredDone = 0;

  dependencies.forEach((dependency) => {
    if (dependency.status === 'violated') {
      blocking.push({
        kind: 'dependency',
        upstream_meeting_id: dependency.upstream.id,
        title: dependency.upstream.title,
        reason: dependency.upstream.status === 'cancelled' ? 'upstream_cancelled' : 'order_broken',
      });
    }
  });

  prerequisites.forEach((prerequisite) => {
    const entry = describePrerequisite(prerequisite);

    if (prerequisite.dropped || INACTIVE_ITEM_STATUSES.has(prerequisite.item_status)) {
      dropped.push(entry);
      return;
    }

    if (prerequisite.required) {
      required += 1;
    }

    if (isComplete(prerequisite)) {
      if (prerequisite.required) {
        requiredDone += 1;
      }
      complete.push(entry);
      return;
    }

    const dueDate = prerequisite.due_date ?? prerequisite.item_due_date ?? meeting.start_time;
    const withDue = { ...entry, due_date: new Date(dueDate).toISOString() };

    if (!prerequisite.required) {
      warnings.push({ ...withDue, reason: 'optional_open' });
    } else if (new Date(dueDate) < asOf) {
      const missingDocument = prerequisite.kind === 'document' && !prerequisite.document_url;
      blocking.push({ ...withDue, reason: missingDocument ? 'missing' : 'overdue' });
    } else {
      atRisk.push({ ...withDue, reason: 'open' });
    }
  });

  let status = 'ready';
  if (blocking.length > 0) {
    status = 'not_ready';
  } else if (atRisk.length > 0) {
    status = 'at_risk';
  }

  return {
    meeting_id: meeting.id,
    status,
    checked_at: asOf.toISOString(),
    blocking,
    at_risk: atRisk,
    warnings,
    complete,
    dropped,
    dependencies: dependencies.map((dependency) => ({
      upstream_meeting_id: dependency.upstream.id,
      status: dependency.status,
    })),
    counts: {
      required,
      required_done: requiredDone,
      optional_open: warnings.length,
    },
  };
}

export async function getReadiness(meetingIdValue, asOfValue) {
  const meetingId = toPositiveId(meetingIdValue, 'id');
  const asOf = toAsOf(asOfValue);
  const meeting = await getMeetingById(meetingId); // 404 if missing

  const [dependencies, prerequisites] = await Promise.all([
    loadUpstream(meeting, asOf),
    findPrerequisitesForMeeting(meetingId),
  ]);

  return evaluateReadiness({ meeting, dependencies, prerequisites, asOf });
}

export default { evaluateReadiness, getReadiness };
