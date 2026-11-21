import { pool } from '../../common/db/index.js';

// Meeting Insights owns no tables: every query here is a read-only SELECT
// over the Meeting Management tables (meetings, meeting_attendees, users).

const MEETING_COLUMNS = `
  m.id,
  m.title,
  m.start_time,
  m.end_time,
  m.status,
  m.organizer_id,
  o.name AS organizer_name,
  o.department AS organizer_department,
  o.team AS organizer_team,
  o.timezone AS organizer_timezone,
  o.working_hours_start::text AS organizer_working_hours_start,
  o.working_hours_end::text AS organizer_working_hours_end
`;

export async function findMeetingsInRange({ start = null, end = null } = {}) {
  const result = await pool.query(
    `
      SELECT ${MEETING_COLUMNS}
      FROM meetings m
      INNER JOIN users o ON o.id = m.organizer_id
      WHERE ($1::timestamptz IS NULL OR m.end_time > $1::timestamptz)
        AND ($2::timestamptz IS NULL OR m.start_time < $2::timestamptz)
      ORDER BY m.start_time ASC, m.id ASC
    `,
    [start, end]
  );

  return result.rows;
}

export async function findMeetingForInsights(id) {
  const result = await pool.query(
    `
      SELECT ${MEETING_COLUMNS}
      FROM meetings m
      INNER JOIN users o ON o.id = m.organizer_id
      WHERE m.id = $1
    `,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function findAttendeesForMeetings(meetingIds) {
  if (meetingIds.length === 0) return [];

  const result = await pool.query(
    `
      SELECT
        ma.meeting_id,
        ma.user_id,
        ma.required,
        u.name,
        u.department,
        u.team,
        u.timezone,
        u.working_hours_start::text AS working_hours_start,
        u.working_hours_end::text AS working_hours_end
      FROM meeting_attendees ma
      INNER JOIN users u ON u.id = ma.user_id
      WHERE ma.meeting_id = ANY($1::int[])
      ORDER BY ma.meeting_id ASC, u.name ASC
    `,
    [meetingIds]
  );

  return result.rows;
}

/** Other non-cancelled meetings that overlap this one and share at least one participant. */
export async function findOverlappingMeetings(meetingId) {
  const result = await pool.query(
    `
      WITH target AS (
        SELECT id, start_time, end_time FROM meetings WHERE id = $1
      ),
      people AS (
        SELECT organizer_id AS user_id FROM meetings WHERE id = $1
        UNION
        SELECT user_id FROM meeting_attendees WHERE meeting_id = $1
      ),
      involvement AS (
        SELECT id AS meeting_id, organizer_id AS user_id FROM meetings
        UNION
        SELECT meeting_id, user_id FROM meeting_attendees
      )
      SELECT DISTINCT
        inv.user_id,
        m.id AS meeting_id,
        m.title,
        m.start_time,
        m.end_time
      FROM people p
      INNER JOIN involvement inv ON inv.user_id = p.user_id
      INNER JOIN meetings m ON m.id = inv.meeting_id
      CROSS JOIN target t
      WHERE m.id <> t.id
        AND m.status <> 'cancelled'
        AND m.start_time < t.end_time
        AND m.end_time > t.start_time
      ORDER BY m.start_time ASC, inv.user_id ASC
    `,
    [meetingId]
  );

  return result.rows;
}

export default {
  findMeetingsInRange,
  findMeetingForInsights,
  findAttendeesForMeetings,
  findOverlappingMeetings,
};
