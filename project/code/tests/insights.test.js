import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const insightsRepository = {
  findDepartmentCounts: jest.fn(),
  findMeetingInsights: jest.fn(),
  findMeetingStatusCounts: jest.fn(),
  findPeopleRanking: jest.fn(),
  findSummaryTotals: jest.fn(),
};

jest.unstable_mockModule('../src/modules/meetings/insights.repository.js', () => insightsRepository);
const insightsService = await import('../src/modules/meetings/insights.service.js');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Meeting Insights service', () => {
  test('calculates meeting totals, average attendance, status and department breakdowns', async () => {
    insightsRepository.findSummaryTotals.mockResolvedValue({
      meetings: 25,
      attendee_assignments: 87,
      unique_people: 19,
    });
    insightsRepository.findMeetingStatusCounts.mockResolvedValue([
      { status: 'cancelled', meeting_count: 3 },
      { status: 'completed', meeting_count: 10 },
      { status: 'scheduled', meeting_count: 12 },
    ]);
    insightsRepository.findDepartmentCounts.mockResolvedValue([
      { department: 'Engineering', attendee_count: 15 },
      { department: 'Operations', attendee_count: 2 },
      { department: 'Product', attendee_count: 8 },
      { department: null, attendee_count: 1 },
    ]);
    insightsRepository.findPeopleRanking.mockResolvedValue([
      { user_id: 1, name: 'John Smith', meeting_count: 12 },
      { user_id: 2, name: 'Jane Doe', meeting_count: 9 },
    ]);

    const result = await insightsService.getMeetingSummary(
      '2026-11-01T00:00:00Z',
      '2026-11-30T23:59:59Z'
    );

    expect(result).toEqual({
      dateRange: {
        start: '2026-11-01T00:00:00.000Z',
        end: '2026-11-30T23:59:59.000Z',
      },
      totals: { meetings: 25, attendees: 87, uniquePeople: 19 },
      attendance: { averageAttendeesPerMeeting: 3.48 },
      by_status: { cancelled: 3, completed: 10, scheduled: 12 },
      by_department: { Engineering: 15, Operations: 2, Product: 8, Unassigned: 1 },
      people: [
        { userId: 1, name: 'John Smith', meetingCount: 12 },
        { userId: 2, name: 'Jane Doe', meetingCount: 9 },
      ],
    });
    expect(insightsRepository.findSummaryTotals).toHaveBeenCalledWith(
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );
    expect(insightsRepository.findMeetingStatusCounts).toHaveBeenCalledWith(
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );
  });

  test('returns zero average when the date range has no meetings', async () => {
    insightsRepository.findSummaryTotals.mockResolvedValue({
      meetings: 0,
      attendee_assignments: 0,
      unique_people: 0,
    });
    insightsRepository.findMeetingStatusCounts.mockResolvedValue([]);
    insightsRepository.findDepartmentCounts.mockResolvedValue([]);
    insightsRepository.findPeopleRanking.mockResolvedValue([]);

    const result = await insightsService.getMeetingSummary(
      '2026-11-01T00:00:00Z',
      '2026-11-01T00:00:00Z'
    );

    expect(result.attendance.averageAttendeesPerMeeting).toBe(0);
    expect(result.by_status).toEqual({});
    expect(result.by_department).toEqual({});
    expect(result.people).toEqual([]);
  });

  test('rejects reversed date ranges', async () => {
    await expect(insightsService.getMeetingSummary(
      '2026-11-30T00:00:00Z',
      '2026-11-01T00:00:00Z'
    )).rejects.toMatchObject({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
    });
    expect(insightsRepository.findSummaryTotals).not.toHaveBeenCalled();
  });

  test('calculates single-meeting attendance and department counts', async () => {
    insightsRepository.findMeetingInsights.mockResolvedValue([
      {
        meeting_id: 17,
        title: 'Sprint Planning',
        status: 'scheduled',
        start_time: '2026-11-18T10:00:00.000Z',
        end_time: '2026-11-18T11:00:00.000Z',
        user_id: 1,
        name: 'John Smith',
        department: 'Engineering',
        required: true,
      },
      {
        meeting_id: 17,
        title: 'Sprint Planning',
        status: 'scheduled',
        start_time: '2026-11-18T10:00:00.000Z',
        end_time: '2026-11-18T11:00:00.000Z',
        user_id: 2,
        name: 'Jane Doe',
        department: 'Product',
        required: false,
      },
      {
        meeting_id: 17,
        title: 'Sprint Planning',
        status: 'scheduled',
        start_time: '2026-11-18T10:00:00.000Z',
        end_time: '2026-11-18T11:00:00.000Z',
        user_id: 3,
        name: 'Sam Lee',
        department: 'Engineering',
        required: true,
      },
    ]);

    await expect(insightsService.getSingleMeetingInsights('17')).resolves.toEqual({
      meetingId: 17,
      title: 'Sprint Planning',
      status: 'scheduled',
      time: {
        start: '2026-11-18T10:00:00.000Z',
        end: '2026-11-18T11:00:00.000Z',
      },
      attendance: { totalAttendees: 3, requiredAttendees: 2, optionalAttendees: 1 },
      departments: { Engineering: 2, Product: 1 },
      attendees: [
        { userId: 1, name: 'John Smith', department: 'Engineering', required: true },
        { userId: 2, name: 'Jane Doe', department: 'Product', required: false },
        { userId: 3, name: 'Sam Lee', department: 'Engineering', required: true },
      ],
    });
  });

  test('returns 404 when the requested meeting does not exist', async () => {
    insightsRepository.findMeetingInsights.mockResolvedValue([]);

    await expect(insightsService.getSingleMeetingInsights('999')).rejects.toMatchObject({
      statusCode: 404,
      code: 'MEETING_NOT_FOUND',
      details: { meeting_id: 999 },
    });
  });
});
