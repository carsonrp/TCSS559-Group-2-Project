import { pool } from '../../common/db/index.js';

export async function createAvailabilitySlot(userId, availableStart, availableEnd) {
  const result = await pool.query(
    `
      INSERT INTO user_availability (user_id, available_start, available_end)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, available_start, available_end, created_at
    `,
    [userId, availableStart, availableEnd]
  );
  return result.rows[0];
}

export async function findAvailabilityByUserId(userId) {
  const result = await pool.query(
    `
      SELECT id, user_id, available_start, available_end, created_at
      FROM user_availability
      WHERE user_id = $1
      ORDER BY available_start ASC, id ASC
    `,
    [userId]
  );
  return result.rows;
}

export async function deleteAvailabilitySlot(id) {
  const result = await pool.query(
    'DELETE FROM user_availability WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount > 0;
}

export async function findAvailabilityByUserIds(userIds) {
  const result = await pool.query(
    `
      SELECT user_id, available_start, available_end
      FROM user_availability
      WHERE user_id = ANY($1::int[])
      ORDER BY user_id, available_start, available_end
    `,
    [userIds]
  );
  return result.rows;
}

export async function findExistingUserIds(userIds) {
  const result = await pool.query(
    'SELECT id FROM users WHERE id = ANY($1::int[])',
    [userIds]
  );
  return result.rows.map((row) => row.id);
}
