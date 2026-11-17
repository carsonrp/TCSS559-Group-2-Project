import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkWorkingHours,
  computeMeetingInsights,
  computeSummary,
  localTime,
  safeTimeZone,
  timeToMinutes,
} from '../src/modules/insights/insightCalculations.js';

const alice = {
  timezone: 'America/Los_Angeles',
  working_hours_start: '09:00:00',
  working_hours_end: '17:00:00',
};

const meeting = (overrides = {}) => ({
  id: 1,
  title: 'Sprint Planning',
  status: 'scheduled',
  start_time: '2026-11-02T17:00:00Z', // Mon 09:00 in Los Angeles (PST)
  end_time: '2026-11-02T18:00:00Z',
  organizer_id: 1,
  organizer_name: 'Alice Martinez',
  organizer_department: 'Product',
  organizer_team: 'Platform',
  organizer_timezone: 'America/Los_Angeles',
  organizer_working_hours_start: '09:00:00',
  organizer_working_hours_end: '17:00:00',
  ...overrides,
});

const attendee = (overrides = {}) => ({
  meeting_id: 1,
  user_id: 2,
  required: true,
  name: 'Daniel Lee',
  department: 'Engineering',
  team: 'Backend',
  timezone: 'America/New_York',
  working_hours_start: '08:00:00',
  working_hours_end: '16:00:00',
  ...overrides,
});

test('localTime converts to the person\'s own time zone', () => {
  const result = localTime('2026-11-02T17:00:00Z', 'America/Los_Angeles');
  assert.equal(result.date, '2026-11-02');
  assert.equal(result.weekday, 1);
  assert.equal(result.minutes, 9 * 60);
  assert.equal(result.label, 'Mon 09:00');
});

test('unknown time zones fall back to UTC', () => {
  assert.equal(safeTimeZone('Not/AZone'), 'UTC');
  assert.equal(safeTimeZone(null), 'UTC');
  assert.equal(localTime('2026-11-02T17:00:00Z', 'Not/AZone').label, 'Mon 17:00');
});

test('timeToMinutes parses Postgres TIME text and falls back when missing', () => {
  assert.equal(timeToMinutes('09:30:00', 0), 570);
  assert.equal(timeToMinutes(null, 540), 540);
});

test('checkWorkingHours accepts a meeting inside the working day', () => {
  const result = checkWorkingHours('2026-11-02T17:00:00Z', '2026-11-02T18:00:00Z', alice);
  assert.equal(result.within_working_hours, true);
  assert.equal(result.reason, null);
});

test('checkWorkingHours flags early starts, late ends and weekends', () => {
  assert.equal(checkWorkingHours('2026-11-02T09:00:00Z', '2026-11-02T10:00:00Z', alice).reason, 'starts_early');
  assert.equal(checkWorkingHours('2026-11-03T00:30:00Z', '2026-11-03T01:30:00Z', alice).reason, 'ends_late');
  assert.equal(checkWorkingHours('2026-11-07T18:00:00Z', '2026-11-07T19:00:00Z', alice).reason, 'weekend');
});

test('computeMeetingInsights lists participants, local times and conflicts', () => {
  const insights = computeMeetingInsights({
    meeting: meeting(),
    attendees: [
      attendee(),
      attendee({ user_id: 3, name: 'Priya Nair', required: false, timezone: 'UTC', department: 'Engineering' }),
      attendee({ user_id: 1, name: 'Alice Martinez' }), // organizer listed again: counted once
    ],
    overlaps: [{ user_id: 2, meeting_id: 9, title: 'Other sync', start_time: 'x', end_time: 'y' }],
  });

  assert.equal(insights.duration_minutes, 60);
  assert.equal(insights.participant_count, 3);
  assert.equal(insights.required_count, 1);
  assert.equal(insights.optional_count, 1);
  assert.equal(insights.person_hours, 3);
  assert.deepEqual(insights.departments, ['Engineering', 'Product']);
  assert.equal(insights.time_zones.length, 3);
  // Daniel: 12:00-13:00 in New York (inside 8-16); Priya: 17:00-18:00 UTC (after 17:00)
  assert.equal(insights.outside_working_hours_count, 1);
  assert.equal(insights.participants.find((p) => p.user_id === 3).reason, 'ends_late');
  assert.equal(insights.conflict_count, 1);
  assert.equal(insights.conflicts[0].name, 'Daniel Lee');
});

test('computeSummary totals hours and leaves cancelled meetings out of the load figures', () => {
  const summary = computeSummary({
    meetings: [
      meeting(),
      meeting({ id: 2, title: 'Weekend review', start_time: '2026-11-07T18:00:00Z', end_time: '2026-11-07T18:30:00Z' }),
      meeting({ id: 3, title: 'Cancelled sync', status: 'cancelled' }),
    ],
    attendees: [attendee(), attendee({ meeting_id: 2 }), attendee({ meeting_id: 3 })],
    start: '2026-11-02T00:00:00.000Z',
    end: '2026-11-09T00:00:00.000Z',
  });

  assert.equal(summary.totals.meetings, 3);
  assert.equal(summary.totals.active_meetings, 2);
  assert.equal(summary.totals.meeting_hours, 1.5);
  assert.equal(summary.totals.person_hours, 3);
  assert.equal(summary.totals.average_duration_minutes, 45);
  assert.equal(summary.totals.meetings_outside_working_hours, 1);
  assert.deepEqual(summary.by_status, [
    { status: 'scheduled', count: 2 },
    { status: 'cancelled', count: 1 },
  ]);
  assert.equal(summary.people[0].hours, 1.5);
  assert.equal(summary.people[0].meetings, 2);
  assert.equal(summary.outside_working_hours.length, 2); // both people, weekend meeting
  assert.equal(summary.attendance.required, 2);
  assert.deepEqual(
    summary.by_department.map((d) => d.department),
    ['Engineering', 'Product']
  );
});
