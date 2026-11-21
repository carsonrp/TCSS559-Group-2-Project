import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const meetingRepository = {
  findDependencyGraph: jest.fn(),
  findMeetingById: jest.fn(),
  findMeetingParticipants: jest.fn(),
  findMeetingsByIds: jest.fn(),
  findMeetingAttendeeIds: jest.fn(),
  insertScheduleChange: jest.fn(),
  lockMeetingRecords: jest.fn(),
  lockUserRecords: jest.fn(),
  updateMeetingSchedule: jest.fn(),
  withUserLocks: jest.fn(),
};
const conflictService = { assertNoSchedulingConflict: jest.fn() };
const notifications = {
  sendDependencyBlockedEmail: jest.fn(),
  sendRescheduledEmail: jest.fn(),
};
const calendarClient = { updateCalendarEvent: jest.fn() };

jest.unstable_mockModule('../src/modules/meetings/meetingRepository.js', () => meetingRepository);
jest.unstable_mockModule('../src/modules/meetings/conflictService.js', () => conflictService);
jest.unstable_mockModule('../src/modules/meetings/attendeeRepository.js', () => ({
  findMeetingAttendeeIds: jest.fn(),
}));
jest.unstable_mockModule('../src/modules/notifications/notificationClient.js', () => notifications);
jest.unstable_mockModule('../src/modules/calendar/calendarClient.js', () => calendarClient);

const { enforceMeetingDependencies, topologicallySortMeetings } = await import(
  '../src/modules/meetings/dependencyEnforcementService.js'
);

beforeEach(() => {
  jest.resetAllMocks();
  conflictService.assertNoSchedulingConflict.mockResolvedValue(undefined);
});

describe('dependency enforcement', () => {
  test('traverses a dependency chain in topological order', () => {
    const order = topologicallySortMeetings([1, 2, 3], [
      { upstream_meeting_id: 1, meeting_id: 2 },
      { upstream_meeting_id: 2, meeting_id: 3 },
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  test('rejects a cycle in the dependency graph', () => {
    try {
      topologicallySortMeetings([1, 2, 3], [
        { upstream_meeting_id: 1, meeting_id: 2 },
        { upstream_meeting_id: 2, meeting_id: 3 },
        { upstream_meeting_id: 3, meeting_id: 1 },
      ]);
      throw new Error('Expected cycle detection to fail');
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 409,
        code: 'DEPENDENCY_CYCLE_DETECTED',
        message: 'Dependency cycle detected',
      });
    }
  });

  test('reschedules downstream meetings recursively while preserving durations', async () => {
    const dependencies = [
      { id: 1, upstream_meeting_id: 1, meeting_id: 2, min_gap_hours: 0 },
      { id: 2, upstream_meeting_id: 2, meeting_id: 3, min_gap_hours: 0 },
    ];
    const meetings = [
      { id: 1, title: 'Planning', start_time: '2026-11-18T11:00:00Z', end_time: '2026-11-18T12:00:00Z', organizer_id: 11, status: 'scheduled' },
      { id: 2, title: 'Review', start_time: '2026-11-18T11:00:00Z', end_time: '2026-11-18T12:00:00Z', organizer_id: 12, status: 'scheduled' },
      { id: 3, title: 'Release', start_time: '2026-11-18T12:00:00Z', end_time: '2026-11-18T13:00:00Z', organizer_id: 13, status: 'scheduled' },
    ];
    meetingRepository.findDependencyGraph.mockResolvedValue(dependencies);
    meetingRepository.findMeetingsByIds.mockResolvedValue(meetings);
    meetingRepository.findMeetingParticipants.mockResolvedValue([
      { meeting_id: 1, user_id: 11 },
      { meeting_id: 2, user_id: 12 },
      { meeting_id: 3, user_id: 13 },
    ]);

    const result = await enforceMeetingDependencies(1, { transaction: true }, {
      reason: 'Planning moved',
    });

    expect(result.map(({ id, start_time, end_time }) => ({ id, start_time, end_time }))).toEqual([
      { id: 2, start_time: new Date('2026-11-18T12:00:00Z'), end_time: new Date('2026-11-18T13:00:00Z') },
      { id: 3, start_time: new Date('2026-11-18T13:00:00Z'), end_time: new Date('2026-11-18T14:00:00Z') },
    ]);
    expect(meetingRepository.updateMeetingSchedule).toHaveBeenCalledTimes(2);
    expect(meetingRepository.insertScheduleChange).toHaveBeenCalledTimes(2);
    expect(conflictService.assertNoSchedulingConflict).toHaveBeenCalledTimes(2);
  });

  test('blocks downstream meetings when an upstream meeting is cancelled', async () => {
    const dependencies = [
      { id: 1, upstream_meeting_id: 1, meeting_id: 2, min_gap_hours: 0 },
      { id: 2, upstream_meeting_id: 2, meeting_id: 3, min_gap_hours: 0 },
    ];
    meetingRepository.findDependencyGraph.mockResolvedValue(dependencies);
    meetingRepository.findMeetingsByIds.mockResolvedValue([
      { id: 1, title: 'Planning', start_time: '2026-11-18T10:00:00Z', end_time: '2026-11-18T11:00:00Z', organizer_id: 11, status: 'cancelled' },
      { id: 2, title: 'Review', start_time: '2026-11-18T12:00:00Z', end_time: '2026-11-18T13:00:00Z', organizer_id: 12, status: 'scheduled' },
      { id: 3, title: 'Release', start_time: '2026-11-18T14:00:00Z', end_time: '2026-11-18T15:00:00Z', organizer_id: 13, status: 'scheduled' },
    ]);
    meetingRepository.findMeetingParticipants.mockResolvedValue([
      { meeting_id: 1, user_id: 11 },
      { meeting_id: 2, user_id: 12 },
      { meeting_id: 3, user_id: 13 },
    ]);

    const updated = await enforceMeetingDependencies(1, { transaction: true });

    expect(updated.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 2, status: 'blocked' },
      { id: 3, status: 'blocked' },
    ]);
    expect(meetingRepository.updateMeetingSchedule).toHaveBeenCalledTimes(2);
    expect(conflictService.assertNoSchedulingConflict).not.toHaveBeenCalled();
  });
});
