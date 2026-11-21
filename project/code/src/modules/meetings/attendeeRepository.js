import { pool } from '../../common/db/index.js';

export async function findMeetingAttendeeIds(meetingId, queryable = pool) {
  const result = await queryable.query(
    'SELECT user_id FROM meeting_attendees WHERE meeting_id = $1 ORDER BY user_id',
    [meetingId]
  );
  return result.rows.map((row) => row.user_id);
}

export async function findMeetingAttendee(meetingId, userId, queryable = pool) {
  const result = await queryable.query(
    'SELECT meeting_id, user_id, required FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2',
    [meetingId, userId]
  );
  return result.rows[0] ?? null;
}

export async function findMeetingAttendees(meetingId, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT u.id AS user_id, u.name, u.email, u.role, u.department, u.team,
             u.timezone, ma.required
      FROM meeting_attendees ma
      INNER JOIN users u ON u.id = ma.user_id
      WHERE ma.meeting_id = $1
      ORDER BY u.name ASC, u.id ASC
    `,
    [meetingId]
  );
  return result.rows;
}

export async function addMeetingAttendee(meetingId, userId, required, queryable = pool) {
  const result = await queryable.query(
    `
      INSERT INTO meeting_attendees (meeting_id, user_id, required)
      VALUES ($1, $2, $3)
      RETURNING meeting_id, user_id, required
    `,
    [meetingId, userId, required]
  );
  return result.rows[0];
}

export async function removeMeetingAttendee(meetingId, userId, queryable = pool) {
  const result = await queryable.query(
    'DELETE FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2 RETURNING user_id',
    [meetingId, userId]
  );
  return result.rowCount > 0;
}

export async function findUserById(id, queryable = pool) {
  const result = await queryable.query('SELECT id FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}
