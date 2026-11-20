import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { env } from '../src/common/config/env.js';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../src/modules/calendar/calendarClient.js';

const originalUrl = env.CALENDAR_SERVICE_URL;
const originalFetch = globalThis.fetch;

afterEach(() => {
  env.CALENDAR_SERVICE_URL = originalUrl;
  globalThis.fetch = originalFetch;
});

describe('Meeting Service calendar HTTP integration', () => {
  test('creates, updates, and deletes calendar events over REST', async () => {
    env.CALENDAR_SERVICE_URL = 'http://calendar.test';
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 4 } }),
    });
    const meeting = {
      id: 7,
      start_time: '2026-11-18T10:00:00Z',
      end_time: '2026-11-18T11:00:00Z',
      status: 'scheduled',
    };

    await createCalendarEvent(meeting);
    await updateCalendarEvent(meeting);
    await deleteCalendarEvent(meeting.id);

    expect(globalThis.fetch.mock.calls.map(([url, options]) => [String(url), options.method])).toEqual([
      ['http://calendar.test/calendar/events', 'POST'],
      ['http://calendar.test/calendar/events/by-meeting/7', 'PUT'],
      ['http://calendar.test/calendar/events/by-meeting/7', 'DELETE'],
    ]);
  });
});
