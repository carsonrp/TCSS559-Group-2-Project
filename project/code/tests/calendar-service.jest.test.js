import { describe, expect, test } from '@jest/globals';
import {
  intersectAvailability,
  subtractBusyTimes,
} from '../services/calendar-service/src/calendar.service.js';

describe('Calendar Service availability', () => {
  test('calculates overlapping availability for every requested user', () => {
    expect(intersectAvailability([1, 2], [
      { user_id: 1, available_start: '2026-11-18T09:00:00Z', available_end: '2026-11-18T12:00:00Z' },
      { user_id: 2, available_start: '2026-11-18T10:00:00Z', available_end: '2026-11-18T11:00:00Z' },
    ])).toEqual([
      { start: Date.parse('2026-11-18T10:00:00Z'), end: Date.parse('2026-11-18T11:00:00Z') },
    ]);
  });

  test('subtracts booked calendar events from common available windows', () => {
    const shared = intersectAvailability([1, 2], [
      { user_id: 1, available_start: '2026-11-18T09:00:00Z', available_end: '2026-11-18T12:00:00Z' },
      { user_id: 2, available_start: '2026-11-18T09:00:00Z', available_end: '2026-11-18T12:00:00Z' },
    ]);

    expect(subtractBusyTimes(shared, [{
      start_time: '2026-11-18T10:00:00Z',
      end_time: '2026-11-18T10:30:00Z',
    }])).toEqual([
      { start: '2026-11-18T09:00:00.000Z', end: '2026-11-18T10:00:00.000Z' },
      { start: '2026-11-18T10:30:00.000Z', end: '2026-11-18T12:00:00.000Z' },
    ]);
  });
});
