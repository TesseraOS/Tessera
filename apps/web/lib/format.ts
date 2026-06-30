/** Number/date formatting helpers shared by stats and charts. */

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Parse a `YYYY-MM-DD` string as a local calendar date (no timezone drift). */
export function parseIsoCalendarDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function formatChartAxisTick(iso: string): string {
  return parseIsoCalendarDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatChartTooltipDate(iso: string): string {
  return parseIsoCalendarDate(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
