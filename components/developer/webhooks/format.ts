import { currentDocumentLocale, formatDateTime } from '@/lib/core/format';

/** A timestamp for the console. Only called after the data has loaded on the client, so it never runs during SSR. */
export function formatWhen(iso: string): string {
  return formatDateTime(iso, currentDocumentLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

/** The error text of the failed request, or the fallback. */
export function failureText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message && !/^HTTP \d+$/.test(error.message) ? error.message : fallback;
}
