import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const serviceEnv = {
  NOTIFICATION_SERVICE_URL: 'http://notification-service.example.test',
  INTERNAL_SERVICE_TOKEN: 'internal-token',
};
jest.unstable_mockModule('../src/common/config/env.js', () => ({ env: serviceEnv }));
const notifications = await import('../src/modules/notifications/notificationClient.js');

const originalFetch = globalThis.fetch;

beforeEach(() => {
  serviceEnv.NOTIFICATION_SERVICE_URL = 'http://notification-service.example.test';
  serviceEnv.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('MeetingLoop Notification Service client', () => {
  test('sends meeting events over authenticated HTTP', async () => {
    const meeting = { id: 8, title: 'Planning' };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { sent: true } }),
    });

    await expect(notifications.sendMeetingCreatedEmail(meeting)).resolves.toEqual({
      data: { sent: true },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('/notifications/created', serviceEnv.NOTIFICATION_SERVICE_URL),
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer internal-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ meeting }),
      })
    );
  });

  test('surfaces remote service rejections as gateway errors', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '{"error":"unavailable"}',
    });

    await expect(notifications.sendMeetingDeletedEmail({ title: 'Planning' }))
      .rejects.toMatchObject({
        statusCode: 502,
        code: 'NOTIFICATION_SERVICE_ERROR',
        details: { status: 503 },
      });
  });

  test('surfaces a network failure as service unavailable', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));

    await expect(notifications.sendMeetingDeletedEmail({ title: 'Planning' }))
      .rejects.toMatchObject({
        statusCode: 503,
        code: 'NOTIFICATION_SERVICE_UNAVAILABLE',
      });
  });

  test('reports missing service credentials rather than silently skipping delivery', async () => {
    serviceEnv.INTERNAL_SERVICE_TOKEN = '';

    await expect(notifications.sendMeetingDeletedEmail({ title: 'Planning' }))
      .rejects.toMatchObject({
        statusCode: 503,
        code: 'NOTIFICATION_SERVICE_NOT_CONFIGURED',
      });
  });
});
