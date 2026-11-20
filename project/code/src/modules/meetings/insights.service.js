import AppError from '../../common/errors/AppError.js';
import {
  findDepartmentCounts,
  findMeetingInsights,
  findMeetingStatusCounts,
  findPeopleRanking,
  findSummaryTotals,
} from './insights.repository.js';

function normalizeDateRange(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime())) {
    throw new AppError('start must be a valid ISO 8601 date-time', 422, 'VALIDATION_ERROR', {
      field: 'start',
    });
  }
  if (Number.isNaN(end.getTime())) {
    throw new AppError('end must be a valid ISO 8601 date-time', 422, 'VALIDATION_ERROR', {
      field: 'end',
    });
  }
  if (end < start) {
    throw new AppError('end must be greater than or equal to start', 422, 'VALIDATION_ERROR', {
      field: 'end',
    });
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function toCount(value) {
  return Number(value) || 0;
}

export async function getMeetingSummary(startValue, endValue) {
  const dateRange = normalizeDateRange(startValue, endValue);
  const [totals, statusRows, departmentRows, peopleRows] = await Promise.all([
    findSummaryTotals(dateRange.start, dateRange.end),
    findMeetingStatusCounts(dateRange.start, dateRange.end),
    findDepartmentCounts(dateRange.start, dateRange.end),
    findPeopleRanking(dateRange.start, dateRange.end),
  ]);
  const meetingCount = toCount(totals.meetings);
  const attendeeCount = toCount(totals.attendee_assignments);

  return {
    dateRange,
    totals: {
      meetings: meetingCount,
      attendees: attendeeCount,
      uniquePeople: toCount(totals.unique_people),
    },
    attendance: {
      averageAttendeesPerMeeting: meetingCount === 0 ? 0 : attendeeCount / meetingCount,
    },
    by_status: Object.fromEntries(statusRows.map((row) => [row.status, toCount(row.meeting_count)])),
    by_department: Object.fromEntries(departmentRows.map((row) => [
      row.department ?? 'Unassigned',
      toCount(row.attendee_count),
    ])),
    people: peopleRows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      meetingCount: toCount(row.meeting_count),
    })),
  };
}

export async function getSingleMeetingInsights(meetingIdValue) {
  const meetingId = Number(meetingIdValue);
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    throw new AppError('id must be a positive integer', 422, 'VALIDATION_ERROR', { field: 'id' });
  }

  const rows = await findMeetingInsights(meetingId);
  if (rows.length === 0) {
    throw new AppError(`Meeting with id ${meetingId} was not found`, 404, 'MEETING_NOT_FOUND', {
      meeting_id: meetingId,
    });
  }

  const meeting = rows[0];
  const attendees = rows
    .filter((row) => row.user_id !== null)
    .map((row) => ({
      userId: row.user_id,
      name: row.name,
      department: row.department,
      required: row.required,
    }));
  const departmentCounts = new Map();
  for (const attendee of attendees) {
    const department = attendee.department ?? 'Unassigned';
    departmentCounts.set(department, (departmentCounts.get(department) ?? 0) + 1);
  }
  const requiredAttendees = attendees.filter((attendee) => attendee.required).length;

  return {
    meetingId: meeting.meeting_id,
    title: meeting.title,
    status: meeting.status,
    time: {
      start: meeting.start_time,
      end: meeting.end_time,
    },
    attendance: {
      totalAttendees: attendees.length,
      requiredAttendees,
      optionalAttendees: attendees.length - requiredAttendees,
    },
    departments: Object.fromEntries(departmentCounts),
    attendees,
  };
}

export default { getMeetingSummary, getSingleMeetingInsights };
