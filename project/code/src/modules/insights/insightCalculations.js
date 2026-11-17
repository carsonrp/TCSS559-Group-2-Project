// Pure functions that turn meeting rows into insights. No database access here,
// so every rule can be unit tested (see tests/insights.test.js).

const WEEKDAY_NUMBERS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DEFAULT_WORK_START = 9 * 60;
const DEFAULT_WORK_END = 17 * 60;
const formatterCache = new Map();

function getFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    );
  }
  return formatterCache.get(timeZone);
}

/** Returns the time zone if the runtime recognises it, otherwise 'UTC'. */
export function safeTimeZone(timeZone) {
  const candidate = timeZone || 'UTC';
  try {
    getFormatter(candidate);
    return candidate;
  } catch {
    return 'UTC';
  }
}

/** Local calendar date, ISO weekday (1 = Mon) and minutes after midnight in a time zone. */
export function localTime(value, timeZone) {
  const zone = safeTimeZone(timeZone);
  const parts = Object.fromEntries(
    getFormatter(zone)
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value])
  );
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);

  return {
    time_zone: zone,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_NUMBERS[parts.weekday],
    minutes: hour * 60 + minute,
    label: `${parts.weekday} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/** '09:30:00' -> 570. Falls back when the value is missing or malformed. */
export function timeToMinutes(value, fallback) {
  if (!value) return fallback;
  const [hours, minutes = '0'] = String(value).split(':');
  const total = Number(hours) * 60 + Number(minutes);
  return Number.isFinite(total) ? total : fallback;
}

export function durationMinutes(start, end) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Is a meeting inside one person's working day, in their own time zone?
 * Working days are Monday to Friday; hours come from the user's working_hours columns.
 */
export function checkWorkingHours(start, end, person) {
  const localStart = localTime(start, person.timezone);
  const localEnd = localTime(end, person.timezone);
  const workStart = timeToMinutes(person.working_hours_start, DEFAULT_WORK_START);
  const workEnd = timeToMinutes(person.working_hours_end, DEFAULT_WORK_END);
  const endMinutes = localEnd.date === localStart.date ? localEnd.minutes : localEnd.minutes + 24 * 60;

  let reason = null;
  if (localStart.weekday > 5) reason = 'weekend';
  else if (localStart.minutes < workStart) reason = 'starts_early';
  else if (endMinutes > workEnd) reason = 'ends_late';

  return {
    within_working_hours: reason === null,
    reason,
    time_zone: localStart.time_zone,
    local_start: localStart.label,
    local_end: localEnd.label,
  };
}

/** Organizer first, then attendees; a user listed twice keeps the organizer role. */
export function buildParticipants(meeting, attendees) {
  const participants = [
    {
      user_id: meeting.organizer_id,
      name: meeting.organizer_name,
      department: meeting.organizer_department,
      team: meeting.organizer_team,
      timezone: meeting.organizer_timezone,
      working_hours_start: meeting.organizer_working_hours_start,
      working_hours_end: meeting.organizer_working_hours_end,
      role: 'organizer',
    },
  ];
  const seen = new Set([meeting.organizer_id]);

  attendees
    .filter((attendee) => attendee.meeting_id === undefined || attendee.meeting_id === meeting.id)
    .forEach((attendee) => {
      if (seen.has(attendee.user_id)) return;
      seen.add(attendee.user_id);
      participants.push({
        user_id: attendee.user_id,
        name: attendee.name,
        department: attendee.department,
        team: attendee.team,
        timezone: attendee.timezone,
        working_hours_start: attendee.working_hours_start,
        working_hours_end: attendee.working_hours_end,
        role: attendee.required ? 'required' : 'optional',
      });
    });

  return participants;
}

/** Insights for one meeting: who is involved, local times, and double-bookings. */
export function computeMeetingInsights({ meeting, attendees, overlaps = [] }) {
  const participants = buildParticipants(meeting, attendees);
  const duration = durationMinutes(meeting.start_time, meeting.end_time);
  const namesById = new Map(participants.map((p) => [p.user_id, p.name]));

  const people = participants.map((person) => ({
    user_id: person.user_id,
    name: person.name,
    role: person.role,
    department: person.department,
    team: person.team,
    ...checkWorkingHours(meeting.start_time, meeting.end_time, person),
  }));

  const zoneCounts = new Map();
  people.forEach((p) => zoneCounts.set(p.time_zone, (zoneCounts.get(p.time_zone) || 0) + 1));

  const conflicts = overlaps.map((row) => ({
    user_id: row.user_id,
    name: namesById.get(row.user_id) ?? null,
    meeting_id: row.meeting_id,
    title: row.title,
    start_time: row.start_time,
    end_time: row.end_time,
  }));

  return {
    meeting_id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    start_time: meeting.start_time,
    end_time: meeting.end_time,
    duration_minutes: duration,
    participant_count: people.length,
    required_count: people.filter((p) => p.role === 'required').length,
    optional_count: people.filter((p) => p.role === 'optional').length,
    person_hours: round((duration * people.length) / 60),
    departments: [...new Set(people.map((p) => p.department || 'Unassigned'))].sort(),
    time_zones: [...zoneCounts.entries()]
      .map(([time_zone, count]) => ({ time_zone, count }))
      .sort((a, b) => b.count - a.count || a.time_zone.localeCompare(b.time_zone)),
    outside_working_hours_count: people.filter((p) => !p.within_working_hours).length,
    conflict_count: new Set(conflicts.map((c) => c.user_id)).size,
    participants: people,
    conflicts,
  };
}

/** Insights across every meeting that overlaps a date range. Cancelled meetings count only in by_status. */
export function computeSummary({ meetings, attendees, start = null, end = null }) {
  const attendeesByMeeting = new Map();
  attendees.forEach((row) => {
    if (!attendeesByMeeting.has(row.meeting_id)) attendeesByMeeting.set(row.meeting_id, []);
    attendeesByMeeting.get(row.meeting_id).push(row);
  });

  const statusCounts = new Map();
  const people = new Map();
  const departments = new Map();
  const outside = [];
  let meetingMinutes = 0;
  let personMinutes = 0;
  let participantTotal = 0;
  let requiredCount = 0;
  let optionalCount = 0;
  let meetingsWithOutside = 0;

  meetings.forEach((meeting) => {
    statusCounts.set(meeting.status, (statusCounts.get(meeting.status) || 0) + 1);
    if (meeting.status === 'cancelled') return;

    const duration = durationMinutes(meeting.start_time, meeting.end_time);
    const participants = buildParticipants(meeting, attendeesByMeeting.get(meeting.id) || []);
    meetingMinutes += duration;
    personMinutes += duration * participants.length;
    participantTotal += participants.length;
    let anyOutside = false;

    participants.forEach((person) => {
      if (person.role === 'required') requiredCount += 1;
      if (person.role === 'optional') optionalCount += 1;

      const check = checkWorkingHours(meeting.start_time, meeting.end_time, person);
      const entry = people.get(person.user_id) || {
        user_id: person.user_id,
        name: person.name,
        department: person.department || 'Unassigned',
        meetings: 0,
        minutes: 0,
        outside_working_hours: 0,
      };
      entry.meetings += 1;
      entry.minutes += duration;
      if (!check.within_working_hours) {
        entry.outside_working_hours += 1;
        anyOutside = true;
        outside.push({
          meeting_id: meeting.id,
          title: meeting.title,
          start_time: meeting.start_time,
          user_id: person.user_id,
          name: person.name,
          local_start: check.local_start,
          time_zone: check.time_zone,
          reason: check.reason,
        });
      }
      people.set(person.user_id, entry);

      const department = person.department || 'Unassigned';
      const dept = departments.get(department) || { department, minutes: 0, meetings: new Set() };
      dept.minutes += duration;
      dept.meetings.add(meeting.id);
      departments.set(department, dept);
    });

    if (anyOutside) meetingsWithOutside += 1;
  });

  const activeMeetings = meetings.filter((m) => m.status !== 'cancelled').length;
  const invited = requiredCount + optionalCount;

  return {
    range: { start, end },
    totals: {
      meetings: meetings.length,
      active_meetings: activeMeetings,
      meeting_hours: round(meetingMinutes / 60),
      person_hours: round(personMinutes / 60),
      average_duration_minutes: activeMeetings ? Math.round(meetingMinutes / activeMeetings) : 0,
      average_participants: activeMeetings ? round(participantTotal / activeMeetings) : 0,
      meetings_outside_working_hours: meetingsWithOutside,
    },
    attendance: {
      required: requiredCount,
      optional: optionalCount,
      optional_share: invited ? round(optionalCount / invited, 2) : 0,
    },
    by_status: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    by_department: [...departments.values()]
      .map((d) => ({ department: d.department, person_hours: round(d.minutes / 60), meetings: d.meetings.size }))
      .sort((a, b) => b.person_hours - a.person_hours || a.department.localeCompare(b.department)),
    people: [...people.values()]
      .map(({ minutes, ...rest }) => ({ ...rest, hours: round(minutes / 60) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name)),
    outside_working_hours: outside.sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time) || a.name.localeCompare(b.name)
    ),
  };
}

export default {
  safeTimeZone,
  localTime,
  timeToMinutes,
  durationMinutes,
  checkWorkingHours,
  buildParticipants,
  computeMeetingInsights,
  computeSummary,
};
