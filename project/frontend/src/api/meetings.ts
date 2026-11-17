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

// ---- Meeting Insights ----

export type WorkingHoursReason = 'weekend' | 'starts_early' | 'ends_late' | null;

export interface InsightParticipant {
  user_id: number;
  name: string;
  role: 'organizer' | 'required' | 'optional';
  department: string | null;
  team: string | null;
  within_working_hours: boolean;
  reason: WorkingHoursReason;
  time_zone: string;
  local_start: string;
  local_end: string;
}

export interface InsightConflict {
  user_id: number;
  name: string | null;
  meeting_id: number;
  title: string;
  start_time: string;
  end_time: string;
}

export interface MeetingInsights {
  meeting_id: number;
  title: string;
  status: MeetingStatus;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  participant_count: number;
  required_count: number;
  optional_count: number;
  person_hours: number;
  departments: string[];
  time_zones: { time_zone: string; count: number }[];
  outside_working_hours_count: number;
  conflict_count: number;
  participants: InsightParticipant[];
  conflicts: InsightConflict[];
}

export interface InsightsSummary {
  range: { start: string | null; end: string | null };
  totals: {
    meetings: number;
    active_meetings: number;
    meeting_hours: number;
    person_hours: number;
    average_duration_minutes: number;
    average_participants: number;
    meetings_outside_working_hours: number;
  };
  attendance: { required: number; optional: number; optional_share: number };
  by_status: { status: MeetingStatus; count: number }[];
  by_department: { department: string; person_hours: number; meetings: number }[];
  people: {
    user_id: number;
    name: string;
    department: string;
    meetings: number;
    hours: number;
    outside_working_hours: number;
  }[];
  outside_working_hours: {
    meeting_id: number;
    title: string;
    start_time: string;
    user_id: number;
    name: string;
    local_start: string;
    time_zone: string;
    reason: WorkingHoursReason;
  }[];
}

export function fetchMeetingInsights(id: number | string) {
  return request<MeetingInsights>(`/api/insights/meetings/${id}`);
}

export function fetchInsightsSummary(start: Date, end: Date) {
  const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
  return request<InsightsSummary>(`/api/insights/summary?${params}`);
}
