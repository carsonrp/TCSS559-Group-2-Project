import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createServer } from 'node:http';

const serviceEnv = {
  PORT: 3020,
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: 587,
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'password',
  SMTP_FROM: 'meetings@example.test',
  INTERNAL_SERVICE_TOKEN: 'unit-secret',
};
const emailProvider = { sendEmail: jest.fn() };
jest.unstable_mockModule('../services/notification-service/src/config/env.js', () => ({ env: serviceEnv }));
jest.unstable_mockModule('../services/notification-service/src/emailProvider.js', () => emailProvider);
const { default: app } = await import('../services/notification-service/src/app.js');

let server;
let serviceUrl;

beforeAll(async () => {
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serviceUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  emailProvider.sendEmail.mockResolvedValue({ messageId: 'test-message' });
});

describe('Notification Service HTTP API', () => {
  const request = (type, body, token = 'unit-secret') => fetch(`${serviceUrl}/notifications/${type}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  test('requires an internal bearer token', async () => {
    const response = await request('created', { meeting: { title: 'Planning' } }, 'wrong-token');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
    expect(emailProvider.sendEmail).not.toHaveBeenCalled();
  });

  test('returns validation errors for malformed notification data', async () => {
    const response = await request('created', { meeting: {} });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  test('accepts a lifecycle event and dispatches the email through its provider', async () => {
    const response = await request('created', {
      meeting: {
        title: 'Sprint Planning',
        start_time: '2026-11-18T10:00:00Z',
        organizer: { name: 'Alex', email: 'alex@example.com' },
        attendees: [{ name: 'Sam', email: 'sam@example.com' }],
      },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { sent: true } });
    expect(emailProvider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['alex@example.com', 'sam@example.com'],
        subject: 'Meeting scheduled: Sprint Planning',
      })
    );
  });
});
