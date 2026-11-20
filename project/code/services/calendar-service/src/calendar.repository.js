import pg from 'pg';
import dotenv from 'dotenv';
import { ServiceError } from './errors.js';

dotenv.config();
const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'meetingloop',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 10,
  connectionTimeoutMillis: 3000,
});
pool.on('error', (error) => {
  console.error('Unexpected Calendar Service PostgreSQL pool error:', error);
});

export async function createEvent(event) {
  const result = await pool.query(
    `INSERT INTO calendar_events (meeting_id, start_time, end_time, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (meeting_id) DO UPDATE
       SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
           status = EXCLUDED.status, updated_at = NOW()
     RETURNING id, meeting_id, start_time, end_time, status, created_at, updated_at`,
    [event.meeting_id, event.start_time, event.end_time, event.status ?? 'scheduled']
  );
  return result.rows[0];
}

export async function findEventById(id) {
  const result = await pool.query(
    `SELECT id, meeting_id, start_time, end_time, status, created_at, updated_at
     FROM calendar_events WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findEventByMeetingId(meetingId) {
  const result = await pool.query(
    `SELECT id, meeting_id, start_time, end_time, status, created_at, updated_at
     FROM calendar_events WHERE meeting_id = $1`,
    [meetingId]
  );
  return result.rows[0] ?? null;
}

export async function updateEvent(id, event) {
  const result = await pool.query(
    `UPDATE calendar_events
     SET start_time = COALESCE($2, start_time),
         end_time = COALESCE($3, end_time),
         status = COALESCE($4, status),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, meeting_id, start_time, end_time, status, created_at, updated_at`,
    [id, event.start_time ?? null, event.end_time ?? null, event.status ?? null]
  );
  return result.rows[0] ?? null;
}

export async function updateEventByMeetingId(meetingId, event) {
  const result = await pool.query(
    `UPDATE calendar_events
     SET start_time = COALESCE($2, start_time),
         end_time = COALESCE($3, end_time),
         status = COALESCE($4, status),
         updated_at = NOW()
     WHERE meeting_id = $1
     RETURNING id, meeting_id, start_time, end_time, status, created_at, updated_at`,
    [meetingId, event.start_time ?? null, event.end_time ?? null, event.status ?? null]
  );
  return result.rows[0] ?? null;
}

export async function deleteEvent(id) {
  const result = await pool.query('DELETE FROM calendar_events WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

export async function deleteEventByMeetingId(meetingId) {
  const result = await pool.query('DELETE FROM calendar_events WHERE meeting_id = $1 RETURNING id', [meetingId]);
  return result.rowCount > 0;
}

export async function findAvailabilityRows(userIds) {
  const result = await pool.query(
    `SELECT user_id, available_start, available_end
     FROM user_availability
     WHERE user_id = ANY($1::int[])
     ORDER BY user_id, available_start, available_end`,
    [userIds]
  );
  return result.rows;
}

export async function findExistingUserIds(userIds) {
  const result = await pool.query('SELECT id FROM users WHERE id = ANY($1::int[])', [userIds]);
  return result.rows.map((row) => row.id);
}

export async function findBusyTimes(userIds) {
  const result = await pool.query(
    `SELECT COALESCE(ce.start_time, m.start_time) AS start_time,
            COALESCE(ce.end_time, m.end_time) AS end_time
     FROM meetings m
     LEFT JOIN calendar_events ce ON ce.meeting_id = m.id
     LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
     WHERE COALESCE(ce.status, m.status) NOT IN ('cancelled', 'blocked')
       AND (m.organizer_id = ANY($1::int[]) OR ma.user_id = ANY($1::int[]))
     ORDER BY COALESCE(ce.start_time, m.start_time)`,
    [userIds]
  );
  return result.rows;
}

export function closePool() {
  return pool.end();
}

export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new ServiceError('Event body must be an object', 422, 'VALIDATION_ERROR');
  }
  const meetingId = Number(event.meeting_id);
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const status = event.status ?? 'scheduled';
  if (!Number.isInteger(meetingId) || meetingId <= 0 ||
      Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start ||
      typeof status !== 'string' || status.trim().length === 0 || status.length > 50) {
    throw new ServiceError('meeting_id, start_time, and end_time must describe a valid event', 422, 'VALIDATION_ERROR');
  }
  return {
    meeting_id: meetingId,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: status.trim(),
  };
}

export default {
  createEvent,
  deleteEvent,
  deleteEventByMeetingId,
  findAvailabilityRows,
  findBusyTimes,
  findEventById,
  findEventByMeetingId,
  findExistingUserIds,
  updateEvent,
  updateEventByMeetingId,
};
