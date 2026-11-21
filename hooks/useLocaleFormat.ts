import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
} from '@/lib/core/format';
import { formatRelativeTime } from '@/lib/i18n/relative-time';

type DateInput =
  | Date
  | string
  | number;

export interface LocaleFormat {
  /** The active language (`i18n.language`), `en` when none is set up. */
  locale: string;
  date(
    v: DateInput,
    opts?: Intl.DateTimeFormatOptions,
  ): string;
  time(
    v: DateInput,
    opts?: Intl.DateTimeFormatOptions,
  ): string;
  dateTime(
    v: DateInput,
    opts?: Intl.DateTimeFormatOptions,
  ): string;
  number(
    n:
      | number
      | bigint,
    opts?: Intl.NumberFormatOptions,
  ): string;
  compact(
    n: number,
  ): string;
  /** "3 days ago" / "in 2 hours" in the active language. */
  relative(
    v: DateInput,
  ): string;
}

/**
 * Dates, times, numbers and relative times in the reader's language.
 *
 * Replaces a bare `toLocaleString()` (browser locale on the client, server locale
 * during SSR, so text differs across hydration) and date-fns' English-only
 * `formatDistanceToNow`. The object is memoised per language; the formatters
 * behind it are cached in `lib/core/format.ts`.
 */
export function useLocaleFormat(): LocaleFormat {
  const {
    i18n,
  } =
    useTranslation();
  const locale =
    i18n?.language ||
    'en';
  return useMemo(
    () => ({
      locale,
      date: (
        v,
        opts,
      ) =>
        formatDate(
          v,
          locale,
          opts,
        ),
      time: (
        v,
        opts,
      ) =>
        formatTime(
          v,
          locale,
          opts,
        ),
      dateTime:
        (
          v,
          opts,
        ) =>
          formatDateTime(
            v,
            locale,
            opts,
          ),
      number:
        (
          n,
          opts,
        ) =>
          formatNumber(
            n,
            locale,
            opts,
          ),
      compact:
        (
          n,
        ) =>
          formatCompact(
            n,
            locale,
          ),
      relative:
        (
          v,
        ) =>
          formatRelativeTime(
            v,
            locale,
          ),
    }),
    [
      locale,
    ],
  );
}
