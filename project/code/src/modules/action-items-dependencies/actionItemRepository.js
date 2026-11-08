import { pool } from '../../common/db/index.js';

const ACTION_ITEM_COLUMNS = `
  id, source_meeting_id, owner_id, description, due_date, status, origin,
  evidence_quote, created_at, updated_at
`;

export async function insertActionItem(item, queryable = pool) {
  const result = await queryable.query(
    `
      INSERT INTO action_items
        (source_meeting_id, owner_id, description, due_date, status, origin, evidence_quote)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${ACTION_ITEM_COLUMNS}
    `,
    [
      item.source_meeting_id,
      item.owner_id,
      item.description,
      item.due_date,
      item.status,
      item.origin,
      item.evidence_quote,
    ]
  );
  return result.rows[0];
}

export async function findActionItemById(id, queryable = pool) {
  const result = await queryable.query(
    `SELECT ${ACTION_ITEM_COLUMNS} FROM action_items WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findActionItems({ meeting_id, owner_id, status }, queryable = pool) {
  const conditions = [];
  const params = [];

  if (meeting_id !== undefined) {
    params.push(meeting_id);
    conditions.push(`source_meeting_id = $${params.length}`);
  }
  if (owner_id !== undefined) {
    params.push(owner_id);
    conditions.push(`owner_id = $${params.length}`);
  }
  if (status !== undefined) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await queryable.query(
    `SELECT ${ACTION_ITEM_COLUMNS} FROM action_items ${where} ORDER BY due_date NULLS LAST, id`,
    params
  );
  return result.rows;
}

export async function updateActionItemRecord(id, fields, queryable = pool) {
  const allowed = ['status', 'owner_id', 'due_date'];
  const assignments = [];
  const params = [];

  allowed.forEach((column) => {
    if (fields[column] !== undefined) {
      params.push(fields[column]);
      assignments.push(`${column} = $${params.length}`);
    }
  });

  params.push(id);
  const result = await queryable.query(
    `
      UPDATE action_items
      SET ${assignments.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING ${ACTION_ITEM_COLUMNS}
    `,
    params
  );
  return result.rows[0] ?? null;
}

export async function insertPrerequisite(prerequisite, queryable = pool) {
  const result = await queryable.query(
    `
      INSERT INTO prerequisites
        (meeting_id, kind, action_item_id, title, document_url, due_date, required, done, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, meeting_id, kind, action_item_id, title, document_url, due_date,
                required, done, dropped, source, created_at
    `,
    [
      prerequisite.meeting_id,
      prerequisite.kind,
      prerequisite.action_item_id,
      prerequisite.title,
      prerequisite.document_url,
      prerequisite.due_date,
      prerequisite.required,
      prerequisite.done,
      prerequisite.source,
    ]
  );
  return result.rows[0];
}

// Prerequisites for one meeting, joined with the action item each one points to.
export async function findPrerequisitesForMeeting(meetingId, queryable = pool) {
  const result = await queryable.query(
    `
      SELECT
        p.id, p.kind, p.action_item_id, p.title, p.document_url, p.due_date,
        p.required, p.done, p.dropped, p.source,
        ai.description AS item_description,
        ai.status AS item_status,
        ai.owner_id AS item_owner_id,
        ai.due_date AS item_due_date
      FROM prerequisites p
      LEFT JOIN action_items ai ON ai.id = p.action_item_id
      WHERE p.meeting_id = $1
      ORDER BY p.id
    `,
    [meetingId]
  );
  return result.rows;
}

export default {
  findActionItemById,
  findActionItems,
  findPrerequisitesForMeeting,
  insertActionItem,
  insertPrerequisite,
  updateActionItemRecord,
};
