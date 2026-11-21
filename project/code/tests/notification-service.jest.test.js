import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const emailProvider = { sendEmail: jest.fn() };
jest.unstable_mockModule('../services/notification-service/src/emailProvider.js', () => emailProvider);
const { sendMeetingNotification } = await import(
  '../services/notification-service/src/notification.service.js'
);

beforeEach(() => {
  jest.resetAllMocks();
  emailProvider.sendEmail.mockResolvedValue({ messageId: 'test-message' });
});

describe('Notification Service email composition', () => {
  const meeting = {
    title: 'Planning <Q4>',
    start_time: '2026-11-18T10:00:00Z',
    end_time: '2026-11-18T11:00:00Z',
    organizer_id: 1,
    organizer: { name: 'Alex', email: 'alex@example.com' },
    attendees: [{ name: 'Sam', email: 'sam@example.com' }],
  };

  test('sends creation email with organizer, attendee list, time, and escaped HTML', async () => {
    await sendMeetingNotification('created', { meeting });

    expect(emailProvider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ['alex@example.com', 'sam@example.com'],
      subject: 'Meeting scheduled: Planning <Q4>',
      text: expect.stringContaining('Organizer: Alex'),
      html: expect.stringContaining('Planning &lt;Q4&gt;'),
    }));
  });

  test('includes old/new schedule and reason in reschedule email', async () => {
    await sendMeetingNotification('rescheduled', {
      meeting,
      old_time: '2026-11-18T09:00:00Z',
      new_time: '2026-11-18T12:00:00Z',
      reason: 'Parent meeting moved',
    });

    const message = emailProvider.sendEmail.mock.calls[0][0];
    expect(message.text).toContain('Previous time: 2026-11-18T09:00:00.000Z');
    expect(message.text).toContain('New time: 2026-11-18T12:00:00.000Z');
    expect(message.text).toContain('Reason: Parent meeting moved');
  });

  test('uses the previous meeting time for an update without a schedule change', async () => {
    await sendMeetingNotification('updated', {
      meeting: { ...meeting, title: 'Planning revised' },
      old_meeting: { start_time: meeting.start_time },
    });

    expect(emailProvider.sendEmail.mock.calls[0][0].text).toContain(
      'Previous time: 2026-11-18T10:00:00.000Z'
    );
    expect(emailProvider.sendEmail.mock.calls[0][0].text).toContain(
      'Reason: The meeting details were updated.'
    );
  });

  test('includes blocked meeting reason and prior time', async () => {
    await sendMeetingNotification('blocked', {
      meeting,
      old_time: '2026-11-18T14:00:00Z',
      reason: 'Sprint Planning was cancelled',
    });

    const message = emailProvider.sendEmail.mock.calls[0][0];
    expect(message.text).toContain('Previous time: 2026-11-18T14:00:00.000Z');
    expect(message.text).toContain('Reason: Sprint Planning was cancelled');
  });

  test('surfaces provider failures to the service caller', async () => {
    emailProvider.sendEmail.mockRejectedValue(new Error('SMTP connection failed'));

    await expect(sendMeetingNotification('deleted', { meeting })).rejects.toThrow(
      'SMTP connection failed'
    );
  });
});
