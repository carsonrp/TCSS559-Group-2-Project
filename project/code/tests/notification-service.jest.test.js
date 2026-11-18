import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const emailProvider = {
  isEmailProviderConfigured: jest.fn(),
  sendEmail: jest.fn(),
};
jest.unstable_mockModule('../src/modules/notifications/emailProvider.js', () => emailProvider);
const notifications = await import('../src/modules/notifications/notification.service.js');

beforeEach(() => {
  jest.resetAllMocks();
  emailProvider.isEmailProviderConfigured.mockReturnValue(true);
  emailProvider.sendEmail.mockResolvedValue({ messageId: 'test-message' });
});

describe('notification service', () => {
  test('sends meeting creation email with organizer, attendee list, and time', async () => {
    const meeting = {
      title: 'Planning <Q4>',
      start_time: '2026-11-18T10:00:00Z',
      end_time: '2026-11-18T11:00:00Z',
      organizer: { name: 'Alex', email: 'alex@example.com' },
      attendees: [{ name: 'Sam', email: 'sam@example.com' }],
    };

    await notifications.sendMeetingCreatedEmail(meeting);

    expect(emailProvider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ['alex@example.com', 'sam@example.com'],
      subject: 'Meeting scheduled: Planning <Q4>',
      text: expect.stringContaining('Organizer: Alex'),
      html: expect.stringContaining('Planning &lt;Q4&gt;'),
    }));
  });

  test('includes old/new schedule and reason in reschedule email', async () => {
    await notifications.sendRescheduledEmail(
      {
        title: 'Review',
        start_time: '2026-11-18T12:00:00Z',
        organizer: { email: 'organizer@example.com' },
        attendees: [],
      },
      '2026-11-18T10:00:00Z',
      '2026-11-18T12:00:00Z',
      'Parent meeting moved'
    );

    expect(emailProvider.sendEmail.mock.calls[0][0].text).toContain(
      'Previous time: 2026-11-18T10:00:00.000Z'
    );
    expect(emailProvider.sendEmail.mock.calls[0][0].text).toContain('Reason: Parent meeting moved');
  });

  test('does not label a title-only edit as a time change', async () => {
    const meeting = {
      title: 'Planning revised',
      start_time: new Date('2026-11-18T10:00:00Z'),
      end_time: new Date('2026-11-18T11:00:00Z'),
      organizer: { email: 'organizer@example.com' },
    };
    await notifications.sendMeetingUpdatedEmail(meeting, {
      start_time: new Date('2026-11-18T10:00:00Z'),
      end_time: new Date('2026-11-18T11:00:00Z'),
    });

    expect(emailProvider.sendEmail.mock.calls[0][0].text).toContain(
      'Reason: The meeting details were updated.'
    );
  });

  test('includes the prior schedule and dependency reason in blocked notices', async () => {
    await notifications.sendDependencyBlockedEmail({
      title: 'Release Review',
      start_time: '2026-11-18T15:00:00Z',
      organizer: { email: 'organizer@example.com' },
    }, 'Sprint Planning was cancelled', '2026-11-18T14:00:00Z');

    expect(emailProvider.sendEmail.mock.calls[0][0].text).toContain(
      'Previous time: 2026-11-18T14:00:00.000Z'
    );
    expect(emailProvider.sendEmail.mock.calls[0][0].text).toContain(
      'Reason: Sprint Planning was cancelled'
    );
  });

  test('explicitly reports skipped email when SMTP is not configured', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    emailProvider.isEmailProviderConfigured.mockReturnValue(false);

    await expect(notifications.sendMeetingDeletedEmail({ title: 'Review' })).resolves.toEqual({
      sent: false,
      skipped: true,
      reason: 'SMTP is not configured',
    });
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});
