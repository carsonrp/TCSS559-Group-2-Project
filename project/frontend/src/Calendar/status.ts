export const STATUS_COLORS: Record<string, string> = {
  scheduled: '#6d4fc2',
  in_progress: '#d97706',
  completed: '#5f7a64',
  cancelled: '#9b9b9b',
};

export function statusColor(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.scheduled;
}

export function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
