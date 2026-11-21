// Meeting status colors, shared by the calendar and the Insights page.
// Validated for color-vision deficiency and contrast with the dataviz palette checker:
// the three chromatic slots stay distinguishable, and white text stays readable on each.
// "Cancelled" is deliberately neutral gray and is always shown with a text label.
export const STATUS_COLORS: Record<string, string> = {
  scheduled: '#6250d6',
  in_progress: '#c24d17',
  completed: '#0e855a',
  cancelled: '#7a7872',
};

export const STATUS_ORDER = ['scheduled', 'in_progress', 'completed', 'cancelled'];

export function statusColor(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.scheduled;
}

export function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
