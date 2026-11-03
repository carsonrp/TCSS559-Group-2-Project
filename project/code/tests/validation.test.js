import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAttendeeList } from '../src/modules/meetings/meetingService.js';

test('normalizeAttendeeList accepts valid attendee entries', () => {
  const result = normalizeAttendeeList([
    { user_id: 2, required: true },
    { user_id: 3, required: false },
  ]);

  assert.deepEqual(result, [
    { user_id: 2, required: true },
    { user_id: 3, required: false },
  ]);
});

test('normalizeAttendeeList rejects duplicate users', () => {
  assert.throws(
    () => normalizeAttendeeList([
      { user_id: 2, required: true },
      { user_id: 2, required: false },
    ]),
    /Duplicate attendee user_id: 2/
  );
});

test('normalizeAttendeeList requires a non-empty list', () => {
  assert.throws(
    () => normalizeAttendeeList([]),
    /At least one attendee is required/
  );
});
