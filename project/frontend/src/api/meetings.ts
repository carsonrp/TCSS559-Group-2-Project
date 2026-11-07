const API_URL = (process.env.REACT_APP_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;

export interface MeetingSummary {
  id: number;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  organizer_id: number;
  status: MeetingStatus;
  organizer_name: string;
  attendee_count: number;
}

export interface Person {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string | null;
  team: string | null;
  timezone: string;
}

export interface MeetingAttendee extends Omit<Person, 'id'> {
  user_id: number;
  required: boolean;
}

export interface MeetingDetail {
  id: number;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  organizer_id: number;
  status: MeetingStatus;
  google_event_id: string | null;
  created_at: string;
  organizer: Person;
  attendees: MeetingAttendee[];
}

export interface CreateMeetingPayload {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  organizer_id: number;
  attendees: { user_id: number; required: boolean }[];
}

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const err = body?.error ?? body;
    const detailMessages = Array.isArray(err?.details)
      ? err.details.map((d: { message?: string }) => d.message).filter(Boolean).join(', ')
      : '';
    const message = detailMessages || err?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, err?.details);
  }

  return body.data as T;
}

export function fetchMeetings(start: Date, end: Date, signal?: AbortSignal) {
  const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
  return request<MeetingSummary[]>(`/api/meetings?${params}`, { signal });
}

export function fetchMeeting(id: number | string) {
  return request<MeetingDetail>(`/api/meetings/${id}`);
}

export function createMeeting(payload: CreateMeetingPayload) {
  return request<MeetingDetail>('/api/meetings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchUsers() {
  return request<Person[]>('/api/users');
}
