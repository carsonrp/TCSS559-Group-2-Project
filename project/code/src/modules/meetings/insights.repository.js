import { pool } from '../../common/db/index.js';

export async function findSummaryTotals(start, end, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT
        COUNT(DISTINCT m.id)::int AS meetings,
        COUNT(ma.user_id)::int AS attendee_assignments,
        COUNT(DISTINCT ma.user_id)::int AS unique_people
      FROM meetings m
      LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
      WHERE m.start_time <= $2::timestamptz
        AND m.end_time >= $1::timestamptz
    `,
    [start, end]
  );
  return result.rows[0];
}

export async function findMeetingStatusCounts(start, end, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT m.status, COUNT(*)::int AS meeting_count
      FROM meetings m
      WHERE m.start_time <= $2::timestamptz
        AND m.end_time >= $1::timestamptz
      GROUP BY m.status
      ORDER BY m.status
    `,
    [start, end]
  );
  return result.rows;
}

export async function findDepartmentCounts(start, end, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT u.department, COUNT(*)::int AS attendee_count
      FROM meetings m
      INNER JOIN meeting_attendees ma ON ma.meeting_id = m.id
      INNER JOIN users u ON u.id = ma.user_id
      WHERE m.start_time <= $2::timestamptz
        AND m.end_time >= $1::timestamptz
      GROUP BY u.department
      ORDER BY u.department NULLS LAST
    `,
    [start, end]
  );
  return result.rows;
}

export async function findPeopleRanking(start, end, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT u.id AS user_id, u.name, COUNT(DISTINCT m.id)::int AS meeting_count
      FROM meetings m
      INNER JOIN meeting_attendees ma ON ma.meeting_id = m.id
      INNER JOIN users u ON u.id = ma.user_id
      WHERE m.start_time <= $2::timestamptz
        AND m.end_time >= $1::timestamptz
      GROUP BY u.id, u.name
      ORDER BY meeting_count DESC, u.name ASC, u.id ASC
    `,
    [start, end]
  );
  return result.rows;
}

export async function findMeetingInsights(meetingId, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT
        m.id AS meeting_id,
        m.title,
        m.status,
        m.start_time,
        m.end_time,
        u.id AS user_id,
        u.name,
        u.department,
        ma.required
      FROM meetings m
      LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
      LEFT JOIN users u ON u.id = ma.user_id
      WHERE m.id = $1
      ORDER BY u.name ASC NULLS LAST, u.id ASC NULLS LAST
    `,
    [meetingId]
  );
  return result.rows;
}

export default {
  findDepartmentCounts,
  findMeetingInsights,
  findMeetingStatusCounts,
  findPeopleRanking,
  findSummaryTotals,
};
