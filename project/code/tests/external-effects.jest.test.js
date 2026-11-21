import { describe, expect, jest, test } from '@jest/globals';
import { runExternalEffects } from '../src/common/services/runExternalEffects.js';

describe('external integration effects', () => {
  test('runs all integrations and surfaces failures after the database commit', async () => {
    const completed = [];
    const calendar = jest.fn(() => {
      completed.push('calendar');
      throw Object.assign(new Error('Calendar Service unavailable'), {
        code: 'CALENDAR_SERVICE_UNAVAILABLE',
      });
    });
    const email = jest.fn(async () => {
      completed.push('email');
    });

    await expect(runExternalEffects([calendar, email])).rejects.toMatchObject({
      statusCode: 502,
      code: 'EXTERNAL_INTEGRATION_FAILED',
      details: {
        failures: [{
          code: 'CALENDAR_SERVICE_UNAVAILABLE',
          message: 'Calendar Service unavailable',
        }],
      },
    });
    expect(completed).toEqual(['calendar', 'email']);
  });
});
