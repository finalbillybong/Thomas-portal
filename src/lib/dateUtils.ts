import { DateTime } from 'luxon';

const TZ = 'Europe/Amsterdam';

export function getTodayKey(): string {
  return DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');
}

export function formatTimestamp(ms: number): string {
  return DateTime.fromMillis(ms).setZone(TZ).toFormat('HH:mm:ss');
}

export function formatDateLabel(dateKey: string): string {
  const dt = DateTime.fromISO(dateKey, { zone: TZ });
  return dt.toFormat('cccc, d MMMM yyyy');
}
