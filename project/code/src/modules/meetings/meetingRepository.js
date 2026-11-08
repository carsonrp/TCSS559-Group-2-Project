import { pool } from '../../common/db/index.js';

export async function withUserLocks(userIds, callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await lockUserRecords(userIds, client);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function lockUserRecords(userIds, queryable = pool) {
  await queryable.query(
    'SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
    [userIds]
  );
}

export async function findUsersByIds(userIds, queryable = pool) {
  const result = await queryable.query(
    'SELECT id FROM users WHERE id = ANY($1::int[])',
    [userIds]
  );
  return result.rows.map((row) => row.id);
}

export async function createMeetingRecord(meetingData, queryable = pool) {
  const {
    title,
    description,
    start_time,
    end_time,
    organizer_id,
    status = 'scheduled',
    attendees = [],
  } = meetingData;

  const meetingResult = await queryable.query(
    `
      INSERT INTO meetings (title, description, start_time, end_time, organizer_id, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [title, description, start_time, end_time, organizer_id, status]
  );
  const meeting = meetingResult.rows[0];

  if (attendees.length > 0) {
    const values = [];
    const params = [];

    attendees.forEach((attendee) => {
      const offset = params.length;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
      params.push(meeting.id, attendee.user_id, attendee.required);
    });

    await queryable.query(
      `
        INSERT INTO meeting_attendees (meeting_id, user_id, required)
        VALUES ${values.join(', ')}
      `,
      params
    );
  }

  return meeting;
}

// Lists meetings, optionally only those overlapping [start, end).
// limit = null returns every matching meeting (used by the calendar view).
export async function findMeetings({ limit = null, offset = 0, start = null, end = null }, queryable = pool) {
  const where = `
    WHERE ($1::timestamptz IS NULL OR m.end_time > $1::timestamptz)
      AND ($2::timestamptz IS NULL OR m.start_time < $2::timestamptz)
  `;
  const [meetingsResult, countResult] = await Promise.all([
    queryable.query(
      `
        SELECT m.id, m.title, m.description, m.start_time, m.end_time, m.organizer_id,
               m.status, m.google_event_id, m.created_at,
               o.name AS organizer_name,
               (SELECT COUNT(*)::int FROM meeting_attendees ma WHERE ma.meeting_id = m.id) AS attendee_count
        FROM meetings m
        INNER JOIN users o ON o.id = m.organizer_id
        ${where}
        ORDER BY m.start_time ASC, m.id ASC
        LIMIT $3 OFFSET $4
      `,
      [start, end, limit, offset]
    ),
    queryable.query(`SELECT COUNT(*)::int AS total FROM meetings m ${where}`, [start, end]),
  ]);

  return { meetings: meetingsResult.rows, total: countResult.rows[0].total };
}

export async function findMeetingById(id, queryable = pool) {
  const meetingResult = await queryable.query(
    `
      SELECT
        m.id, m.title, m.description, m.start_time, m.end_time, m.organizer_id,
        m.status, m.google_event_id, m.created_at,
        o.name AS organizer_name, o.email AS organizer_email, o.role AS organizer_role,
        o.department AS organizer_department, o.team AS organizer_team,
        o.timezone AS organizer_timezone
      FROM meetings m
      INNER JOIN users o ON o.id = m.organizer_id
      WHERE m.id = $1
    `,
    [id]
  );

  if (meetingResult.rowCount === 0) {
    return null;
  }

  const meeting = meetingResult.rows[0];
  const attendeesResult = await queryable.query(
    `
      SELECT ma.user_id, ma.required, u.name, u.email, u.role,
             u.department, u.team, u.timezone
      FROM meeting_attendees ma
      INNER JOIN users u ON u.id = ma.user_id
      WHERE ma.meeting_id = $1
      ORDER BY u.name ASC, u.id ASC
    `,
    [id]
  );

  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    start_time: meeting.start_time,
    end_time: meeting.end_time,
    organizer_id: meeting.organizer_id,
    status: meeting.status,
    google_event_id: meeting.google_event_id,
    created_at: meeting.created_at,
    organizer: {
      id: meeting.organizer_id,
      name: meeting.organizer_name,
      email: meeting.organizer_email,
      role: meeting.organizer_role,
      department: meeting.organizer_department,
      team: meeting.organizer_team,
      timezone: meeting.organizer_timezone,
    },
    attendees: attendeesResult.rows.map((row) => ({
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department,
      team: row.team,
      timezone: row.timezone,
      required: row.required,
    })),
  };
}

export async function lockMeetingRecord(id, queryable = pool) {
  const result = await queryable.query(
    'SELECT id FROM meetings WHERE id = $1 FOR UPDATE',
    [id]
  );
  return result.rowCount > 0;
}

export async function updateMeetingRecord(id, meetingData, queryable = pool) {
  const result = await queryable.query(
    `
      UPDATE meetings
      SET title = $2, description = $3, start_time = $4, end_time = $5, status = $6
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      meetingData.title,
      meetingData.description,
      meetingData.start_time,
      meetingData.end_time,
      meetingData.status,
    ]
  );
  return result.rows[0] ?? null;
}

export async function deleteMeetingRecord(id, queryable = pool) {
  const result = await queryable.query('DELETE FROM meetings WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

export async function findConflictingMeetings(
  { start_time, end_time, attendee_ids, exclude_meeting_id },
  queryable = pool
) {
  const result = await queryable.query(
    `
      SELECT DISTINCT m.id AS meeting_id, m.title
      FROM meetings m
      LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
      WHERE m.status <> 'cancelled'
        AND m.start_time < $2
        AND m.end_time > $1
        AND (m.organizer_id = ANY($3::int[]) OR ma.user_id = ANY($3::int[]))
        AND ($4::int IS NULL OR m.id <> $4)
      ORDER BY m.id
    `,
    [start_time, end_time, attendee_ids, exclude_meeting_id ?? null]
  );
  return result.rows;
}
