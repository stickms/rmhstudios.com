const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A timestamp for the console. Only called after the data has loaded on the client, so it never runs during SSR. */
export function formatWhen(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** The error text of the failed request, or the fallback. */
export function failureText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message && !/^HTTP \d+$/.test(error.message) ? error.message : fallback;
}
