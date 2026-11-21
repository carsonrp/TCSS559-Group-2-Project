import { env } from '../../common/config/env.js';
import AppError from '../../common/errors/AppError.js';

async function requestNotification(type, body) {
  if (!env.NOTIFICATION_SERVICE_URL) {
    throw new AppError(
      'Notification Service is not configured; set NOTIFICATION_SERVICE_URL',
      503,
      'NOTIFICATION_SERVICE_UNAVAILABLE'
    );
  }
  if (!env.INTERNAL_SERVICE_TOKEN) {
    throw new AppError(
      'Notification Service credentials are not configured; set INTERNAL_SERVICE_TOKEN',
      503,
      'NOTIFICATION_SERVICE_NOT_CONFIGURED'
    );
  }

  let response;
  try {
    response = await fetch(new URL(`/notifications/${type}`, env.NOTIFICATION_SERVICE_URL), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    throw new AppError('Notification Service is unavailable', 503, 'NOTIFICATION_SERVICE_UNAVAILABLE', {
      reason: error.message,
    });
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new AppError('Notification Service rejected the request', 502, 'NOTIFICATION_SERVICE_ERROR', {
      status: response.status,
      response: responseText,
    });
  }
  return response.json();
}

export const sendMeetingCreatedEmail = (meeting) => requestNotification('created', { meeting });
export const sendMeetingUpdatedEmail = (meeting, oldMeeting) =>
  requestNotification('updated', { meeting, old_meeting: oldMeeting });
export const sendMeetingDeletedEmail = (meeting) => requestNotification('deleted', { meeting });
export const sendDependencyBlockedEmail = (meeting, reason, oldTime = meeting?.start_time) =>
  requestNotification('blocked', { meeting, old_time: oldTime, reason });
export const sendRescheduledEmail = (meeting, oldTime, newTime, reason) =>
  requestNotification('rescheduled', { meeting, old_time: oldTime, new_time: newTime, reason });

export default {
  sendDependencyBlockedEmail,
  sendMeetingCreatedEmail,
  sendMeetingDeletedEmail,
  sendMeetingUpdatedEmail,
  sendRescheduledEmail,
};
