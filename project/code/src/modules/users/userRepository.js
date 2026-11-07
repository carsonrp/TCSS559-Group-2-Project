import { pool } from '../../common/db/index.js';

export async function findAllUsers() {
  const result = await pool.query(
    `
      SELECT id, name, email, role, department, team, timezone
      FROM users
      ORDER BY name ASC
    `
  );

  return result.rows;
}

export default { findAllUsers };
