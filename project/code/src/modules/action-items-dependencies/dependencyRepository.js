import { pool } from '../../common/db/index.js';

// Fixed key for a transaction-scoped advisory lock. Holding it while checking for
// cycles and inserting stops two concurrent requests from creating a cycle together.
const DEPENDENCY_GRAPH_LOCK_KEY = 559001;

export async function withDependencyGraphLock(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [DEPENDENCY_GRAPH_LOCK_KEY]);
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

export async function dependencyExists(meetingId, upstreamMeetingId, queryable = pool) {
  const result = await queryable.query(
    'SELECT 1 FROM meeting_dependencies WHERE meeting_id = $1 AND upstream_meeting_id = $2',
    [meetingId, upstreamMeetingId]
  );
  return result.rowCount > 0;
}

// Adding "meetingId depends on upstreamMeetingId" creates a cycle if upstreamMeetingId
// already depends on meetingId, directly or through other meetings.
export async function wouldCreateCycle(meetingId, upstreamMeetingId, queryable = pool) {
  const result = await queryable.query(
    `
      WITH RECURSIVE upstream_chain AS (
        SELECT upstream_meeting_id
        FROM meeting_dependencies
        WHERE meeting_id = $1
        UNION
        SELECT d.upstream_meeting_id
        FROM meeting_dependencies d
        INNER JOIN upstream_chain c ON d.meeting_id = c.upstream_meeting_id
      )
      SELECT EXISTS (
        SELECT 1 FROM upstream_chain WHERE upstream_meeting_id = $2
      ) AS has_cycle
    `,
    [upstreamMeetingId, meetingId]
  );
  return result.rows[0].has_cycle;
}

export async function insertDependency({ meeting_id, upstream_meeting_id, min_gap_hours }, queryable = pool) {
  const result = await queryable.query(
    `
      INSERT INTO meeting_dependencies (meeting_id, upstream_meeting_id, min_gap_hours)
      VALUES ($1, $2, $3)
      RETURNING id, meeting_id, upstream_meeting_id, min_gap_hours, created_at
    `,
    [meeting_id, upstream_meeting_id, min_gap_hours]
  );
  return result.rows[0];
}

export async function findUpstreamDependencies(meetingId, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT id, meeting_id, upstream_meeting_id, min_gap_hours, created_at
      FROM meeting_dependencies
      WHERE meeting_id = $1
      ORDER BY upstream_meeting_id
    `,
    [meetingId]
  );
  return result.rows;
}

export async function findDownstreamDependencies(meetingId, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT id, meeting_id, upstream_meeting_id, min_gap_hours, created_at
      FROM meeting_dependencies
      WHERE upstream_meeting_id = $1
      ORDER BY meeting_id
    `,
    [meetingId]
  );
  return result.rows;
}

export default {
  dependencyExists,
  findDownstreamDependencies,
  findUpstreamDependencies,
  insertDependency,
  withDependencyGraphLock,
  wouldCreateCycle,
};
