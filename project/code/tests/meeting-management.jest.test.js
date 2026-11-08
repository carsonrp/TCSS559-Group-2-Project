import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const meetingRepository = {
  createMeetingRecord: jest.fn(),
  deleteMeetingRecord: jest.fn(),
  findConflictingMeetings: jest.fn(),
  findMeetingAttendeeIds: jest.fn(),
  findMeetingById: jest.fn(),
  findMeetings: jest.fn(),
  findUsersByIds: jest.fn(),
  lockUserRecords: jest.fn(),
  lockMeetingRecord: jest.fn(),
  updateMeetingRecord: jest.fn(),
  withUserLocks: jest.fn(),
};
const availabilityRepository = {
  createAvailabilitySlot: jest.fn(),
  deleteAvailabilitySlot: jest.fn(),
  findAvailabilityByUserId: jest.fn(),
  findAvailabilityByUserIds: jest.fn(),
  findExistingUserIds: jest.fn(),
};
const attendeeRepository = {
  findMeetingAttendeeIds: jest.fn(),
};

jest.unstable_mockModule('../src/modules/meetings/meetingRepository.js', () => meetingRepository);
jest.unstable_mockModule('../src/modules/meetings/attendeeRepository.js', () => attendeeRepository);
jest.unstable_mockModule('../src/modules/meetings/availabilityRepository.js', () => availabilityRepository);

const meetingService = await import('../src/modules/meetings/meetingService.js');
const conflictService = await import('../src/modules/meetings/conflictService.js');
const availabilityService = await import('../src/modules/meetings/availabilityService.js');

const existingMeeting = {
  id: 8,
  title: 'Planning',
  description: '',
  start_time: '2026-11-16T09:00:00.000Z',
  end_time: '2026-11-16T10:00:00.000Z',
  organizer_id: 1,
  status: 'scheduled',
  attendees: [{ user_id: 2 }],
};

beforeEach(() => {
  jest.resetAllMocks();
  meetingRepository.withUserLocks.mockImplementation(async (_ids, callback) => callback({ transaction: true }));
  meetingRepository.lockMeetingRecord.mockResolvedValue(true);
  meetingRepository.findConflictingMeetings.mockResolvedValue([]);
  attendeeRepository.findMeetingAttendeeIds.mockResolvedValue([2]);
});

describe('meeting management services', () => {
  test('creates a meeting and attendee records in a locked transaction', async () => {
    const savedMeeting = { ...existingMeeting, id: 25 };
    meetingRepository.findUsersByIds.mockResolvedValue([1, 2]);
    meetingRepository.createMeetingRecord.mockResolvedValue({ id: 25 });
    meetingRepository.findMeetingById.mockResolvedValue(savedMeeting);

    const result = await meetingService.createMeeting({
      title: 'Planning',
      organizer_id: 1,
      start_time: '2026-11-16T09:00:00Z',
      end_time: '2026-11-16T10:00:00Z',
      attendees: [{ user_id: 2, required: true }],
    });

    expect(result).toEqual(savedMeeting);
    expect(meetingRepository.withUserLocks).toHaveBeenCalledWith([1, 2], expect.any(Function));
    expect(meetingRepository.createMeetingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Planning',
        organizer_id: 1,
        attendees: [{ user_id: 2, required: true }],
      }),
      { transaction: true }
    );
    expect(meetingRepository.findConflictingMeetings).toHaveBeenCalled();
  });

  test('updates meeting fields and excludes the meeting itself from conflict checks', async () => {
    const updatedMeeting = { ...existingMeeting, title: 'Planning revised' };
    meetingRepository.findMeetingById
      .mockResolvedValueOnce(existingMeeting)
      .mockResolvedValueOnce(existingMeeting)
      .mockResolvedValueOnce(updatedMeeting);
    meetingRepository.updateMeetingRecord.mockResolvedValue(updatedMeeting);

    const result = await meetingService.updateMeeting(8, { title: 'Planning revised' });

    expect(result).toEqual(updatedMeeting);
    expect(meetingRepository.updateMeetingRecord).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ title: 'Planning revised' }),
      { transaction: true }
    );
    expect(meetingRepository.findConflictingMeetings).toHaveBeenCalledWith(
      expect.objectContaining({ exclude_meeting_id: 8, attendee_ids: [1, 2] }),
      { transaction: true }
    );
  });

  test('deletes a meeting and its dependent attendee records', async () => {
    meetingRepository.findMeetingById.mockResolvedValue(existingMeeting);
    meetingRepository.deleteMeetingRecord.mockResolvedValue(true);

    await expect(meetingService.deleteMeeting(8)).resolves.toBeUndefined();
    expect(meetingRepository.deleteMeetingRecord).toHaveBeenCalledWith(8, { transaction: true });
  });

  test('reports real conflicting meetings for a requested schedule', async () => {
    meetingRepository.findUsersByIds.mockResolvedValue([1, 2]);
    meetingRepository.findConflictingMeetings.mockResolvedValue([
      { meeting_id: 3, title: 'Sprint Planning' },
    ]);

    const result = await conflictService.validateMeetingSchedule({
      start: '2026-11-02T09:30:00Z',
      end: '2026-11-02T10:30:00Z',
      attendees: ['1', '2'],
    });

    expect(result).toEqual({
      conflict: true,
      conflictingMeetings: [{ meetingId: 3, title: 'Sprint Planning' }],
    });
  });

  test('rejects meeting creation with HTTP 409 when an attendee is already booked', async () => {
    meetingRepository.findUsersByIds.mockResolvedValue([1, 2]);
    meetingRepository.findConflictingMeetings.mockResolvedValue([
      { meeting_id: 3, title: 'Sprint Planning' },
    ]);

    await expect(meetingService.createMeeting({
      title: 'Overlapping meeting',
      organizer_id: 1,
      start_time: '2026-11-02T09:30:00Z',
      end_time: '2026-11-02T10:30:00Z',
      attendees: [{ user_id: 2 }],
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SCHEDULING_CONFLICT',
    });
    expect(meetingRepository.createMeetingRecord).not.toHaveBeenCalled();
  });

  test('calculates and merges intersections shared by every attendee', () => {
    const result = availabilityService.calculateCommonAvailability([1, 2], [
      { user_id: 1, available_start: '2026-11-01T09:00:00Z', available_end: '2026-11-01T12:00:00Z' },
      { user_id: 1, available_start: '2026-11-01T13:00:00Z', available_end: '2026-11-01T17:00:00Z' },
      { user_id: 2, available_start: '2026-11-01T10:00:00Z', available_end: '2026-11-01T11:00:00Z' },
      { user_id: 2, available_start: '2026-11-01T11:00:00Z', available_end: '2026-11-01T14:00:00Z' },
      { user_id: 2, available_start: '2026-11-01T15:00:00Z', available_end: '2026-11-01T16:00:00Z' },
    ]);

    expect(result).toEqual([
      { start: '2026-11-01T10:00:00.000Z', end: '2026-11-01T12:00:00.000Z' },
      { start: '2026-11-01T13:00:00.000Z', end: '2026-11-01T14:00:00.000Z' },
      { start: '2026-11-01T15:00:00.000Z', end: '2026-11-01T16:00:00.000Z' },
    ]);
  });
});
