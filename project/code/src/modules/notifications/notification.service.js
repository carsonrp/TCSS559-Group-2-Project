import { isEmailProviderConfigured, sendEmail } from './emailProvider.js';
import AppError from '../../common/errors/AppError.js';

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
  return value ? new Date(value).toISOString() : 'Not applicable';
}

function recipients(meeting) {
  const emails = [
    meeting.organizer?.email,
    ...(meeting.attendees ?? []).map((attendee) => attendee.email),
  ].filter(Boolean);
  return [...new Set(emails)];
}

async function sendMeetingNotification(type, meeting, { oldMeeting, oldTime, reason } = {}) {
  if (!meeting || typeof meeting.title !== 'string' || !meeting.title.trim()) {
    throw new AppError('A meeting title is required for email notifications', 422, 'VALIDATION_ERROR');
  }
  if (!isEmailProviderConfigured()) {
    console.warn(`Email notification '${type}' skipped: SMTP is not configured.`);
    return { sent: false, skipped: true, reason: 'SMTP is not configured' };
  }

  const priorStart = oldTime ?? oldMeeting?.start_time;
  const content = {
    title: meeting.title,
    oldTime: formatTime(priorStart),
    newTime: formatTime(meeting.start_time),
    organizer: meeting.organizer?.name ?? `User ${meeting.organizer_id}`,
    attendees: (meeting.attendees ?? []).map((attendee) => attendee.name ?? attendee.email).filter(Boolean),
    reason: reason ?? 'No additional reason provided.',
  };
  const to = recipients(meeting);
  if (to.length === 0) {
    throw new AppError('At least one organizer or attendee email is required', 422, 'VALIDATION_ERROR');
  }
  const subjectByType = {
    created: `Meeting scheduled: ${content.title}`,
    updated: `Meeting updated: ${content.title}`,
    deleted: `Meeting cancelled: ${content.title}`,
    blocked: `Meeting blocked: ${content.title}`,
    rescheduled: `Meeting rescheduled: ${content.title}`,
  };
  const subject = subjectByType[type];
  const lines = [
    `Meeting: ${content.title}`,
    `Previous time: ${content.oldTime}`,
    `New time: ${type === 'deleted' ? 'Deleted' : content.newTime}`,
    `Organizer: ${content.organizer}`,
    `Attendees: ${content.attendees.join(', ') || 'None listed'}`,
    `Reason: ${content.reason}`,
  ];
  const text = lines.join('\n');
  const html = `<h2>${escapeHtml(subject)}</h2><dl>${lines.map((line) => {
    const [label, ...valueParts] = line.split(': ');
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(valueParts.join(': '))}</dd>`;
  }).join('')}</dl>`;

  await sendEmail({
    to,
    subject,
    text,
    html,
  });
  return { sent: true };
}

export const sendMeetingCreatedEmail = (meeting) => sendMeetingNotification('created', meeting);
export const sendMeetingUpdatedEmail = (meeting, oldMeeting) => sendMeetingNotification('updated', meeting, {
  oldMeeting,
  reason: new Date(oldMeeting?.start_time).getTime() !== new Date(meeting.start_time).getTime()
    || new Date(oldMeeting?.end_time).getTime() !== new Date(meeting.end_time).getTime()
    ? 'The meeting time or details were updated.'
    : 'The meeting details were updated.',
});
export const sendMeetingDeletedEmail = (meeting) => sendMeetingNotification('deleted', meeting, {
  oldTime: meeting.start_time,
  reason: 'The meeting was deleted.',
});
export const sendDependencyBlockedEmail = (meeting, reason, oldTime = meeting?.start_time) => sendMeetingNotification(
  'blocked',
  meeting,
  { oldTime, reason }
);
export const sendRescheduledEmail = (meeting, oldTime, newTime, reason) => sendMeetingNotification(
  'rescheduled',
  { ...meeting, start_time: newTime },
  { oldTime, reason }
);

export default {
  sendDependencyBlockedEmail,
  sendMeetingCreatedEmail,
  sendMeetingDeletedEmail,
  sendMeetingUpdatedEmail,
  sendRescheduledEmail,
};
