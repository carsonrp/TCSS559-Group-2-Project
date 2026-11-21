import AppError from '../../common/errors/AppError.js';
import { getMeetingById } from '../meetings/meetingService.js';
import {
  findActionItemById,
  findActionItems,
  insertActionItem,
  insertPrerequisite,
  updateActionItemRecord,
} from './actionItemRepository.js';
import { toPositiveId } from './dependencyService.js';

export const ACTION_ITEM_STATUSES = ['proposed', 'open', 'done', 'dropped', 'rejected'];

// Allowed status changes. AI-proposed items are confirmed (open) or rejected;
// open items are completed or dropped; done items can be reopened.
const TRANSITIONS = {
  proposed: ['open', 'rejected'],
  open: ['done', 'dropped'],
  done: ['open'],
  dropped: [],
  rejected: [],
};

function participantIds(meeting) {
  return new Set([meeting.organizer_id, ...meeting.attendees.map((attendee) => attendee.user_id)]);
}

function toOptionalDate(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${field} must be a valid ISO 8601 date-time`, 422, 'VALIDATION_ERROR', { field });
  }
  return date.toISOString();
}

function assertOwnerIsParticipant(ownerId, meeting) {
  if (ownerId !== null && !participantIds(meeting).has(ownerId)) {
    throw new AppError(
      `User ${ownerId} is not the organizer or an attendee of meeting ${meeting.id}`,
      422,
      'OWNER_NOT_PARTICIPANT',
      { owner_id: ownerId, meeting_id: meeting.id }
    );
  }
}

async function getActionItemOrThrow(id) {
  const item = await findActionItemById(id);
  if (!item) {
    throw new AppError(`Action item with id ${id} was not found`, 404, 'ACTION_ITEM_NOT_FOUND', {
      action_item_id: id,
    });
  }
  return item;
}

export async function createActionItem(meetingIdValue, payload = {}) {
  const meetingId = toPositiveId(meetingIdValue, 'id');
  const meeting = await getMeetingById(meetingId);

  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  if (!description) {
    throw new AppError('description is required', 422, 'VALIDATION_ERROR', { field: 'description' });
  }

  const ownerId = payload.owner_id == null ? null : toPositiveId(payload.owner_id, 'owner_id');
  assertOwnerIsParticipant(ownerId, meeting);

  const origin = payload.origin ?? 'manual';
  const evidenceQuote = payload.evidence_quote == null ? null : String(payload.evidence_quote).trim();
  if (origin === 'ai' && !evidenceQuote) {
    throw new AppError('AI-created action items must include evidence_quote', 422, 'VALIDATION_ERROR', {
      field: 'evidence_quote',
    });
  }

  return insertActionItem({
    source_meeting_id: meetingId,
    owner_id: ownerId,
    description,
    due_date: toOptionalDate(payload.due_date, 'due_date'),
    // AI output is never authoritative: it starts as proposed until a user confirms it.
    status: origin === 'ai' ? 'proposed' : 'open',
    origin,
    evidence_quote: evidenceQuote,
  });
}

export async function listActionItems(filters = {}) {
  return findActionItems({
    meeting_id: filters.meeting_id == null ? undefined : toPositiveId(filters.meeting_id, 'meeting_id'),
    owner_id: filters.owner_id == null ? undefined : toPositiveId(filters.owner_id, 'owner_id'),
    status: filters.status,
  });
}

export async function updateActionItem(idValue, payload = {}, actingUserId) {
  const id = toPositiveId(idValue, 'id');
  const item = await getActionItemOrThrow(id);
  const meeting = await getMeetingById(item.source_meeting_id);
  const changes = {};

  // Phase II: the acting user comes from the X-User-Id header, when sent.
  // Owner or organizer may change status; only the organizer may drop.
  if (actingUserId != null) {
    const isOrganizer = actingUserId === meeting.organizer_id;
    const isOwner = actingUserId === item.owner_id;
    if (!isOrganizer && !isOwner) {
      throw new AppError('Only the item owner or the meeting organizer can change this item', 403, 'FORBIDDEN', {
        user_id: actingUserId,
      });
    }
    if (payload.status === 'dropped' && !isOrganizer) {
      throw new AppError('Only the meeting organizer can drop an item', 403, 'FORBIDDEN', {
        user_id: actingUserId,
      });
    }
  }

  if (payload.status !== undefined && payload.status !== item.status) {
    if (!(TRANSITIONS[item.status] ?? []).includes(payload.status)) {
      throw new AppError(
        `Cannot change status from ${item.status} to ${payload.status}`,
        409,
        'INVALID_STATUS_TRANSITION',
        { from: item.status, to: payload.status, allowed: TRANSITIONS[item.status] ?? [] }
      );
    }
    changes.status = payload.status;
  }

  if (payload.owner_id !== undefined) {
    const ownerId = payload.owner_id === null ? null : toPositiveId(payload.owner_id, 'owner_id');
    assertOwnerIsParticipant(ownerId, meeting);
    changes.owner_id = ownerId;
  }

  if (payload.due_date !== undefined) {
    changes.due_date = toOptionalDate(payload.due_date, 'due_date');
  }

  if (Object.keys(changes).length === 0) {
    return item;
  }
  return updateActionItemRecord(id, changes);
}

export async function addPrerequisite(meetingIdValue, payload = {}) {
  const meetingId = toPositiveId(meetingIdValue, 'id');
  await getMeetingById(meetingId);

  const kind = payload.kind;
  const prerequisite = {
    meeting_id: meetingId,
    kind,
    action_item_id: null,
    title: null,
    document_url: null,
    due_date: toOptionalDate(payload.due_date, 'due_date'),
    required: payload.required ?? true,
    done: false,
    source: payload.source ?? 'manual',
  };

  if (kind === 'action_item') {
    const itemId = toPositiveId(payload.action_item_id, 'action_item_id');
    await getActionItemOrThrow(itemId);
    prerequisite.action_item_id = itemId;
  } else {
    prerequisite.title = String(payload.title).trim();
    prerequisite.document_url = payload.document_url ?? null;
    prerequisite.done = payload.done ?? false;
  }

  try {
    return await insertPrerequisite(prerequisite);
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('This action item is already a prerequisite of the meeting', 409, 'DUPLICATE_PREREQUISITE', {
        meeting_id: meetingId,
        action_item_id: prerequisite.action_item_id,
      });
    }
    throw error;
  }
}

export default { addPrerequisite, createActionItem, listActionItems, updateActionItem };
