import test from 'node:test';
import assert from 'node:assert/strict';

import { dependencyStatus } from '../src/modules/action-items-dependencies/dependencyService.js';
import { evaluateReadiness } from '../src/modules/action-items-dependencies/readinessService.js';

const asOf = new Date('2026-11-09T00:00:00Z');
const meeting = { id: 13, start_time: '2026-11-12T09:30:00Z' };
const upstream = (overrides = {}) => ({
  id: 11,
  title: 'Roadmap Alignment',
  start_time: '2026-11-10T12:30:00Z',
  end_time: '2026-11-10T13:30:00Z',
  status: 'scheduled',
  ...overrides,
});
const item = (overrides = {}) => ({
  id: 1,
  kind: 'action_item',
  action_item_id: 7,
  required: true,
  dropped: false,
  item_description: 'Draft the launch checklist',
  item_status: 'open',
  item_owner_id: 5,
  item_due_date: '2026-11-11T17:00:00Z',
  ...overrides,
});

test('dependencyStatus: pending when order holds but upstream has not happened', () => {
  assert.equal(dependencyStatus(meeting, upstream(), 24, asOf), 'pending');
});

test('dependencyStatus: satisfied once upstream has ended', () => {
  assert.equal(dependencyStatus(meeting, upstream(), 24, new Date('2026-11-11T00:00:00Z')), 'satisfied');
});

test('dependencyStatus: violated when the gap is not respected', () => {
  assert.equal(dependencyStatus(meeting, upstream(), 48, asOf), 'violated');
});

test('dependencyStatus: violated when upstream is cancelled', () => {
  assert.equal(dependencyStatus(meeting, upstream({ status: 'cancelled' }), 0, asOf), 'violated');
});

test('readiness: ready when every required prerequisite is done', () => {
  const result = evaluateReadiness({ meeting, prerequisites: [item({ item_status: 'done' })], asOf });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.counts, { required: 1, required_done: 1, optional_open: 0 });
});

test('readiness: at_risk when a required item is open but not yet due', () => {
  const result = evaluateReadiness({ meeting, prerequisites: [item()], asOf });
  assert.equal(result.status, 'at_risk');
  assert.equal(result.at_risk[0].reason, 'open');
});

test('readiness: not_ready when a required item is overdue', () => {
  const result = evaluateReadiness({
    meeting,
    prerequisites: [item({ item_due_date: '2026-11-04T17:00:00Z' })],
    asOf,
  });
  assert.equal(result.status, 'not_ready');
  assert.equal(result.blocking[0].reason, 'overdue');
});

test('readiness: a required document without a link past its due date is missing', () => {
  const result = evaluateReadiness({
    meeting,
    prerequisites: [{ id: 2, kind: 'document', title: 'Budget forecast', required: true, done: false, dropped: false, due_date: '2026-11-08T00:00:00Z' }],
    asOf,
  });
  assert.equal(result.blocking[0].reason, 'missing');
});

test('readiness: optional open items are warnings only', () => {
  const result = evaluateReadiness({ meeting, prerequisites: [item({ required: false })], asOf });
  assert.equal(result.status, 'ready');
  assert.equal(result.warnings.length, 1);
});

test('readiness: dropped prerequisites and dropped items are listed, not counted', () => {
  const result = evaluateReadiness({
    meeting,
    prerequisites: [item({ dropped: true }), item({ id: 3, item_status: 'dropped' })],
    asOf,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.dropped.length, 2);
  assert.equal(result.counts.required, 0);
});

test('readiness: a violated dependency blocks the meeting', () => {
  const result = evaluateReadiness({
    meeting,
    dependencies: [{ upstream: upstream(), status: 'violated' }],
    asOf,
  });
  assert.equal(result.status, 'not_ready');
  assert.equal(result.blocking[0].reason, 'order_broken');
});

test('readiness: due date falls back to the meeting start time', () => {
  const result = evaluateReadiness({
    meeting,
    prerequisites: [item({ item_due_date: null })],
    asOf,
  });
  assert.equal(result.at_risk[0].due_date, '2026-11-12T09:30:00.000Z');
});
