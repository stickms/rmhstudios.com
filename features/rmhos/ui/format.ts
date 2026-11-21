/** Sizes and times in the language the page is shown in (the app's locale, not the browser's). */

/** `1536` -> "2 kB", `5 * 1024 * 1024` -> "5.0 MB", in `locale`. */
export function formatBytes(bytes: number, locale: string): string {
  const mb = bytes >= 1024 * 1024;
  const value = mb ? bytes / (1024 * 1024) : Math.max(1, Math.round(bytes / 1024));
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: mb ? 'megabyte' : 'kilobyte',
      unitDisplay: 'short',
      minimumFractionDigits: mb ? 1 : 0,
      maximumFractionDigits: mb ? 1 : 0,
    }).format(value);
  } catch {
    return `${mb ? value.toFixed(1) : value} ${mb ? 'MB' : 'KB'}`;
  }
}

/** A save time, date and time, short form, in `locale`. */
export function formatTime(ms: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(ms);
  } catch {
    return new Date(ms).toLocaleString();
  }
}
