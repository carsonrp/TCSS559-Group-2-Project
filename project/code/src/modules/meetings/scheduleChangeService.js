import {
  findMeetingById,
  findMeetingParticipants,
  findMeetingsByIds,
  insertScheduleChange,
  lockMeetingRecords,
  lockUserRecords,
  updateMeetingSchedule,
} from './meetingRepository.js';
import { assertNoSchedulingConflict } from './conflictService.js';
import { sendDependencyBlockedEmail, sendRescheduledEmail } from '../notifications/notification.service.js';
import { updateCalendarEvent } from '../calendar/calendarClient.js';
import { runExternalEffects } from '../../common/services/runExternalEffects.js';

// Meeting Management applies schedule changes to its own tables. The dependency rules
// that decide those changes belong to the Action Item and Dependency Management module,
// which registers them here at startup. This keeps the dependency between the two
// modules one-way: Meeting Management never imports that module.

let scheduleRules = null;

export function registerScheduleRules(rules) {
  scheduleRules = rules;
}

// The changes the dependency rules require after meetingId changed. No rules registered
// (for example in Meeting Management's own unit tests) means no dependent changes.
export async function planDependentChanges(meetingId, queryable, options = {}) {
  if (!scheduleRules) {
    return [];
  }
  return scheduleRules.planDependencyChanges(meetingId, queryable, options);
}

// Loads and locks the meetings a plan may touch, and their participants, inside the
// caller's transaction. Returns the meeting rows the rules need.
export async function lockMeetingsForScheduling(meetingIds, queryable) {
  const ids = [...new Set(meetingIds.map(Number))];
  const meetings = await findMeetingsByIds(ids, queryable);
  const participants = await findMeetingParticipants(ids, queryable);
  await lockUserRecords([...new Set(participants.map((row) => Number(row.user_id)))].sort((a, b) => a - b), queryable);
  await lockMeetingRecords([...ids].sort((a, b) => a - b), queryable);
  return meetings;
}

// Saves each planned change, logs it, and checks the moved meetings for attendee
// conflicts. Any conflict throws, which rolls back the caller's whole transaction.
export async function applyScheduleChanges(changes, queryable) {
  for (const change of changes) {
    await updateMeetingSchedule(change.id, change, queryable);
    await insertScheduleChange({
      meeting_id: change.id,
      old_start_time: change.previous_start_time,
      old_end_time: change.previous_end_time,
      new_start_time: change.start_time,
      new_end_time: change.end_time,
      old_status: change.previous_status,
      new_status: change.status,
      reason: change.reason,
    }, queryable);
  }

  const moved = changes.filter((change) => change.status !== 'blocked' && change.status !== 'cancelled');
  if (moved.length > 0) {
    const participants = await findMeetingParticipants(moved.map((change) => change.id), queryable);
    for (const change of moved) {
      const attendeeIds = participants
        .filter((row) => Number(row.meeting_id) === Number(change.id))
        .map((row) => Number(row.user_id));
      await assertNoSchedulingConflict({
        start_time: change.start_time,
        end_time: change.end_time,
        attendee_ids: [...new Set([Number(change.organizer_id), ...attendeeIds])],
        exclude_meeting_id: change.id,
      }, queryable);
    }
  }
  return changes;
}

// Calendar updates and emails for applied changes, run after the transaction commits.
export function scheduleChangeEffects(changes) {
  return changes.map((change) => async () => {
    const meeting = await findMeetingById(change.id);
    await updateCalendarEvent(meeting);
    if (change.status === 'blocked') {
      return sendDependencyBlockedEmail(meeting, change.reason, change.previous_start_time);
    }
    return sendRescheduledEmail(meeting, change.previous_start_time, change.start_time, change.reason);
  });
}

export async function notifyScheduleChanges(changes) {
  return runExternalEffects(scheduleChangeEffects(changes));
}

export default {
  applyScheduleChanges,
  lockMeetingsForScheduling,
  notifyScheduleChanges,
  planDependentChanges,
  registerScheduleRules,
  scheduleChangeEffects,
};
