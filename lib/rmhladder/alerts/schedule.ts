export interface LadderAlertSchedulePrefs {
  digestFrequency: string;
  timezone?: string | null;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
}

function localParts(now: Date, timezone: string | null | undefined) {
  const zone = timezone || 'America/New_York';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(now);
    return {
      hour: Number(parts.find((part) => part.type === 'hour')?.value ?? 0),
      weekday: parts.find((part) => part.type === 'weekday')?.value ?? 'Mon',
    };
  } catch {
    return localParts(now, 'UTC');
  }
}

export function isQuietTime(prefs: LadderAlertSchedulePrefs, now = new Date()): boolean {
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;
  if (start == null || end == null || start === end) return false;
  const { hour } = localParts(now, prefs.timezone);
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Worker ticks every four hours; the 08:00–11:59 local window yields one daily slot. */
export function isDigestDue(prefs: LadderAlertSchedulePrefs, now = new Date()): boolean {
  if (isQuietTime(prefs, now)) return false;
  if (prefs.digestFrequency === 'immediate') return true;
  const local = localParts(now, prefs.timezone);
  if (local.hour < 8 || local.hour >= 12) return false;
  return prefs.digestFrequency === 'daily'
    || (prefs.digestFrequency === 'weekly' && local.weekday === 'Mon');
}

export function formatInUserTimezone(
  value: Date,
  timezone: string | null | undefined,
): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

export function localDateKey(now: Date, timezone: string | null | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
