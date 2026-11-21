import { sendEmail } from './emailProvider.js';
import { ServiceError } from './errors.js';

const subjectByType = {
  created: (title) => `Meeting scheduled: ${title}`,
  updated: (title) => `Meeting updated: ${title}`,
  deleted: (title) => `Meeting cancelled: ${title}`,
  blocked: (title) => `Meeting blocked: ${title}`,
  rescheduled: (title) => `Meeting rescheduled: ${title}`,
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatTime(value) {
  if (value === undefined || value === null || value === '') {
    return 'Not applicable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError('Meeting time must be a valid date-time', 422, 'VALIDATION_ERROR');
  }
  return date.toISOString();
}

function emailRecipients(meeting) {
  const emails = [
    meeting.organizer?.email,
    ...(meeting.attendees ?? []).map((attendee) => attendee.email),
  ].filter(Boolean);
  const recipients = [...new Set(emails)];
  if (recipients.length === 0) {
    throw new ServiceError('At least one organizer or attendee email is required', 422, 'VALIDATION_ERROR');
  }
  return recipients;
}

function validateNotification(type, payload) {
  if (!Object.hasOwn(subjectByType, type)) {
    throw new ServiceError('Unsupported notification type', 422, 'VALIDATION_ERROR');
  }
  const meeting = payload?.meeting;
  if (!meeting || typeof meeting !== 'object' || Array.isArray(meeting) ||
      typeof meeting.title !== 'string' || !meeting.title.trim()) {
    throw new ServiceError('meeting.title is required', 422, 'VALIDATION_ERROR');
  }
  if (meeting.attendees !== undefined &&
      (!Array.isArray(meeting.attendees) ||
       meeting.attendees.some((attendee) => !attendee || typeof attendee !== 'object'))) {
    throw new ServiceError('meeting.attendees must be an array of attendee objects', 422, 'VALIDATION_ERROR');
  }
  return meeting;
}

export async function sendMeetingNotification(type, payload) {
  const meeting = validateNotification(type, payload);
  const recipients = emailRecipients(meeting);
  const oldMeeting = payload.old_meeting ?? {};
  const content = {
    title: meeting.title.trim(),
    oldTime: formatTime(payload.old_time ?? oldMeeting.start_time ?? meeting.start_time),
    newTime: type === 'deleted' ? 'Deleted' : formatTime(payload.new_time ?? meeting.start_time),
    organizer: meeting.organizer?.name ?? `User ${meeting.organizer_id ?? 'unknown'}`,
    attendees: (meeting.attendees ?? []).map((attendee) => attendee.name ?? attendee.email).filter(Boolean),
    reason: payload.reason ?? (
      type === 'created' ? 'A new meeting was scheduled.'
        : type === 'deleted' ? 'The meeting was deleted.'
          : type === 'updated' ? 'The meeting details were updated.'
            : 'No additional reason provided.'
    ),
  };
  const subject = subjectByType[type](content.title);
  const lines = [
    `Meeting: ${content.title}`,
    `Previous time: ${content.oldTime}`,
    `New time: ${content.newTime}`,
    `Organizer: ${content.organizer}`,
    `Attendees: ${content.attendees.join(', ') || 'None listed'}`,
    `Reason: ${content.reason}`,
  ];
  const text = lines.join('\n');
  const html = `<h2>${escapeHtml(subject)}</h2><dl>${lines.map((line) => {
    const [label, ...valueParts] = line.split(': ');
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(valueParts.join(': '))}</dd>`;
  }).join('')}</dl>`;

  await sendEmail({ to: recipients, subject, text, html });
  return { sent: true };
}

export default { sendMeetingNotification };
