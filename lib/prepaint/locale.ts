import {
  LOCALES,
  RTL_LOCALES,
  type Locale,
} from '../i18n/config';
import type { PrepaintCtx } from './types';

/**
 * Reads the locale cookie and sets lang/dir on <html> before the body paints,
 * so there is no flash of wrong direction (important for Arabic RTL). Works as
 * a fallback for the SSR-set lang/dir attribute and for client navigations.
 */
export function localeStep({
  doc,
  html,
}: PrepaintCtx): void {
  const m =
    doc.cookie.match(
      /(?:^|; )rmh-lang=([^;]+)/,
    );
  let l: string =
    m
      ? decodeURIComponent(
          m[1],
        )
      : 'en';
  if (
    (
      LOCALES as readonly string[]
    ).indexOf(
      l,
    ) <
    0
  )
    l =
      'en';
  html.lang =
    l;
  html.setAttribute(
    'dir',
    RTL_LOCALES.has(
      l as Locale,
    )
      ? 'rtl'
      : 'ltr',
  );
}
