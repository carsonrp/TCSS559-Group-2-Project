import { pool } from '../../common/db/index.js';

export async function createMeetingRecord(meetingData) {
  const { title, description, start_time, end_time, organizer_id, attendees = [] } = meetingData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const meetingResult = await client.query(
      `
        INSERT INTO meetings (title, description, start_time, end_time, organizer_id, status)
        VALUES ($1, $2, $3, $4, $5, 'scheduled')
        RETURNING *
      `,
      [title, description, start_time, end_time, organizer_id]
    );

    const meetingId = meetingResult.rows[0].id;

    if (attendees.length > 0) {
      const values = [];
      const params = [];

      attendees.forEach((attendee) => {
        values.push(`($${params.length + 1}, $${params.length + 2}, $${params.length + 3})`);
        params.push(meetingId, attendee.user_id, attendee.required);
      });

      await client.query(
        `
          INSERT INTO meeting_attendees (meeting_id, user_id, required)
          VALUES ${values.join(', ')}
        `,
        params
      );
    }

    await client.query('COMMIT');
    return meetingResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function findMeetingById(id) {
  const meetingResult = await pool.query(
    `
      SELECT
        m.id,
        m.title,
        m.description,
        m.start_time,
        m.end_time,
        m.organizer_id,
        m.status,
        m.google_event_id,
        m.created_at,
        o.name AS organizer_name,
        o.email AS organizer_email,
        o.role AS organizer_role,
        o.department AS organizer_department,
        o.team AS organizer_team,
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
  const attendeesResult = await pool.query(
    `
      SELECT
        ma.user_id,
        ma.required,
        u.name,
        u.email,
        u.role,
        u.department,
        u.team,
        u.timezone
      FROM meeting_attendees ma
      INNER JOIN users u ON u.id = ma.user_id
      WHERE ma.meeting_id = $1
      ORDER BY u.name ASC
    `,
    [id]
  );

  const organizer = {
    id: meeting.organizer_id,
    name: meeting.organizer_name,
    email: meeting.organizer_email,
    role: meeting.organizer_role,
    department: meeting.organizer_department,
    team: meeting.organizer_team,
    timezone: meeting.organizer_timezone,
  };

  const attendees = attendeesResult.rows.map((row) => ({
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    team: row.team,
    timezone: row.timezone,
    required: row.required,
  }));

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
    organizer,
    attendees,
  };
}

export default {
  createMeetingRecord,
  findMeetingById,
};
