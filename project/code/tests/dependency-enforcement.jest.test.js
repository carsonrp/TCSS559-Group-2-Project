import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// Rules: pure functions in the Action Item and Dependency Management module.
import {
  findConnectedMeetingIds,
  planScheduleChanges,
  topologicallySortMeetings,
} from '../src/modules/action-items-dependencies/scheduleRules.js';

// Applying a plan: Meeting Management, with its repository and side effects mocked.
const meetingRepository = {
  findMeetingById: jest.fn(),
  findMeetingParticipants: jest.fn(),
  findMeetingsByIds: jest.fn(),
  insertScheduleChange: jest.fn(),
  lockMeetingRecords: jest.fn(),
  lockUserRecords: jest.fn(),
  updateMeetingSchedule: jest.fn(),
};
const conflictService = { assertNoSchedulingConflict: jest.fn() };
const notifications = {
  sendDependencyBlockedEmail: jest.fn(),
  sendRescheduledEmail: jest.fn(),
};
const calendarClient = { updateCalendarEvent: jest.fn() };

jest.unstable_mockModule('../src/modules/meetings/meetingRepository.js', () => meetingRepository);
jest.unstable_mockModule('../src/modules/meetings/conflictService.js', () => conflictService);
jest.unstable_mockModule('../src/modules/notifications/notification.service.js', () => notifications);
jest.unstable_mockModule('../src/modules/calendar/calendarClient.js', () => calendarClient);

const { applyScheduleChanges } = await import('../src/modules/meetings/scheduleChangeService.js');

const chain = [
  { id: 1, upstream_meeting_id: 1, meeting_id: 2, min_gap_hours: 0 },
  { id: 2, upstream_meeting_id: 2, meeting_id: 3, min_gap_hours: 0 },
];
const byId = (meetings) => new Map(meetings.map((meeting) => [meeting.id, meeting]));

beforeEach(() => {
  jest.resetAllMocks();
  conflictService.assertNoSchedulingConflict.mockResolvedValue(undefined);
  meetingRepository.findMeetingParticipants.mockResolvedValue([
    { meeting_id: 2, user_id: 12 },
    { meeting_id: 3, user_id: 13 },
  ]);
});

describe('dependency schedule rules', () => {
  test('traverses a dependency chain in topological order', () => {
    expect(topologicallySortMeetings([1, 2, 3], chain)).toEqual([1, 2, 3]);
  });

  test('rejects a cycle in the dependency graph', () => {
    expect(() => topologicallySortMeetings([1, 2, 3], [
      ...chain,
      { upstream_meeting_id: 3, meeting_id: 1 },
    ])).toThrow(expect.objectContaining({ statusCode: 409, code: 'DEPENDENCY_CYCLE_DETECTED' }));
  });

  test('finds every meeting connected to the changed one', () => {
    expect([...findConnectedMeetingIds(2, chain)].sort()).toEqual([1, 2, 3]);
  });

  test('moves downstream meetings recursively while preserving durations', () => {
    const changes = planScheduleChanges({
      meetingIds: [1, 2, 3],
      dependencies: chain,
      meetingsById: byId([
        { id: 1, start_time: '2026-11-18T11:00:00Z', end_time: '2026-11-18T12:00:00Z', organizer_id: 11, status: 'scheduled' },
        { id: 2, start_time: '2026-11-18T11:00:00Z', end_time: '2026-11-18T12:00:00Z', organizer_id: 12, status: 'scheduled' },
        { id: 3, start_time: '2026-11-18T12:00:00Z', end_time: '2026-11-18T13:00:00Z', organizer_id: 13, status: 'scheduled' },
      ]),
      reason: 'Planning moved',
    });

    expect(changes.map(({ id, start_time, end_time, reason }) => ({ id, start_time, end_time, reason }))).toEqual([
      { id: 2, start_time: new Date('2026-11-18T12:00:00Z'), end_time: new Date('2026-11-18T13:00:00Z'), reason: 'Planning moved' },
      { id: 3, start_time: new Date('2026-11-18T13:00:00Z'), end_time: new Date('2026-11-18T14:00:00Z'), reason: 'Planning moved' },
    ]);
  });

  test('blocks downstream meetings when an upstream meeting is cancelled', () => {
    const changes = planScheduleChanges({
      meetingIds: [1, 2, 3],
      dependencies: chain,
      meetingsById: byId([
        { id: 1, start_time: '2026-11-18T10:00:00Z', end_time: '2026-11-18T11:00:00Z', organizer_id: 11, status: 'cancelled' },
        { id: 2, start_time: '2026-11-18T12:00:00Z', end_time: '2026-11-18T13:00:00Z', organizer_id: 12, status: 'scheduled' },
        { id: 3, start_time: '2026-11-18T14:00:00Z', end_time: '2026-11-18T15:00:00Z', organizer_id: 13, status: 'scheduled' },
      ]),
    });

    expect(changes.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 2, status: 'blocked' },
      { id: 3, status: 'blocked' },
    ]);
  });

  test('plans nothing when every dependency already holds', () => {
    const changes = planScheduleChanges({
      meetingIds: [1, 2],
      dependencies: [chain[0]],
      meetingsById: byId([
        { id: 1, start_time: '2026-11-18T10:00:00Z', end_time: '2026-11-18T11:00:00Z', organizer_id: 11, status: 'scheduled' },
        { id: 2, start_time: '2026-11-18T12:00:00Z', end_time: '2026-11-18T13:00:00Z', organizer_id: 12, status: 'scheduled' },
      ]),
    });
    expect(changes).toEqual([]);
  });
});

describe('applying a schedule plan (Meeting Management)', () => {
  const moved = {
    id: 2,
    organizer_id: 12,
    start_time: new Date('2026-11-18T12:00:00Z'),
    end_time: new Date('2026-11-18T13:00:00Z'),
    status: 'scheduled',
    previous_start_time: '2026-11-18T11:00:00Z',
    previous_end_time: '2026-11-18T12:00:00Z',
    previous_status: 'scheduled',
    reason: 'Planning moved',
  };

  test('saves and logs each change and conflict-checks moved meetings', async () => {
    await applyScheduleChanges([moved, { ...moved, id: 3, organizer_id: 13, status: 'blocked' }], { transaction: true });

    expect(meetingRepository.updateMeetingSchedule).toHaveBeenCalledTimes(2);
    expect(meetingRepository.insertScheduleChange).toHaveBeenCalledTimes(2);
    expect(conflictService.assertNoSchedulingConflict).toHaveBeenCalledTimes(1);
    expect(conflictService.assertNoSchedulingConflict).toHaveBeenCalledWith(
      expect.objectContaining({ attendee_ids: [12], exclude_meeting_id: 2 }),
      { transaction: true }
    );
  });

  test('a conflict on a moved meeting rejects the whole change', async () => {
    conflictService.assertNoSchedulingConflict.mockRejectedValue(
      Object.assign(new Error('conflict'), { statusCode: 409, code: 'SCHEDULING_CONFLICT' })
    );
    await expect(applyScheduleChanges([moved], { transaction: true }))
      .rejects.toMatchObject({ code: 'SCHEDULING_CONFLICT' });
  });
});
