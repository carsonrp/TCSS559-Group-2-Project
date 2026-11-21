import { env } from '../../common/config/env.js';
import AppError from '../../common/errors/AppError.js';

async function request(path, { method = 'GET', body } = {}) {
  if (!env.CALENDAR_SERVICE_URL) {
    console.warn('Calendar Service integration skipped: CALENDAR_SERVICE_URL is not configured.');
    return null;
  }

  let response;
  try {
    response = await fetch(new URL(path, env.CALENDAR_SERVICE_URL), {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    throw new AppError('Calendar Service is unavailable', 503, 'CALENDAR_SERVICE_UNAVAILABLE', {
      reason: error.message,
    });
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new AppError('Calendar Service rejected the request', 502, 'CALENDAR_SERVICE_ERROR', {
      status: response.status,
      response: responseText,
    });
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export function createCalendarEvent(meeting) {
  return request('/calendar/events', {
    method: 'POST',
    body: {
      meeting_id: meeting.id,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      status: meeting.status,
    },
  });
}

export function updateCalendarEvent(meeting) {
  return request(`/calendar/events/by-meeting/${meeting.id}`, {
    method: 'PUT',
    body: {
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      status: meeting.status,
    },
  });
}

export function deleteCalendarEvent(meetingId) {
  return request(`/calendar/events/by-meeting/${meetingId}`, { method: 'DELETE' });
}

export default { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent };
