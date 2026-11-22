/**
 * The first day of the week for a locale, as `Date#getUTCDay()` numbers (0 = Sunday).
 * Uses `Intl.Locale` week data where the runtime has it; Monday otherwise.
 */

interface WeekInfo {
  firstDay: number;
}
/**
 * Not `extends Intl.Locale`: newer TypeScript libs declare `getWeekInfo` with
 * their own week type, and older runtimes only have the `weekInfo` getter. Only
 * the shape read here matters.
 */
interface LocaleWithWeekInfo {
  weekInfo?: WeekInfo;
  getWeekInfo?: () => WeekInfo;
}

export function firstDayOfWeek(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as unknown as LocaleWithWeekInfo;
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    // Week data numbers Monday 1 to Sunday 7; `getUTCDay` has Sunday 0.
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return info.firstDay % 7;
  } catch {
    /* an unknown tag: fall through to Monday */
  }
  return 1;
}
