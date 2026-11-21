import type { WorkingHoursReason } from '../api/meetings';

export const REASON_LABELS: Record<string, string> = {
  starts_early: 'Starts before their day',
  ends_late: 'Ends after their day',
  weekend: 'Falls on a weekend',
};

export function reasonLabel(reason: WorkingHoursReason) {
  return reason ? REASON_LABELS[reason] ?? reason : '';
}

/** Backend local-time labels are "Mon 13:30"; show them as "Mon 1:30 PM". */
export function formatLocalLabel(label: string) {
  const match = /^(\w{3}) (\d{2}):(\d{2})$/.exec(label);
  if (!match) return label;
  const [, day, hh, mm] = match;
  const hour = Number(hh);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} ${h12}:${mm} ${suffix}`;
}

/** "America/Los_Angeles" -> "Los Angeles" */
export function shortZone(zone: string) {
  if (zone === 'UTC') return 'UTC';
  return (zone.split('/').pop() || zone).replace(/_/g, ' ');
}

export function formatHours(hours: number) {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatWhen(iso: string) {
  return whenFmt.format(new Date(iso));
}

export function formatTimeRange(start: string, end: string) {
  return `${formatWhen(start)} – ${timeFmt.format(new Date(end))}`;
}
