'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * X12 composer pieces.
 *
 * `useRequireAltText` reads the member's setting lazily — only once the draft
 * actually has an image — so a text-only composer never makes the request. The
 * result is cached for the page's lifetime; the server enforces the rule
 * regardless, this just lets the composer say so before the round trip.
 */
let cached: boolean | null = null;

export function useRequireAltText(hasImages: boolean): boolean {
  const [value, setValue] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (!hasImages || cached !== null) return;
    let cancelled = false;
    fetch('/api/settings/alt-text', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { requireAltText?: boolean } | null) => {
        cached = d?.requireAltText ?? false;
        if (!cancelled) setValue(cached);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasImages]);
  return value;
}

/** Shown under the image strip while some image still needs a description. */
export function AltTextNotice({
  missing,
  onFix,
}: {
  missing: number[];
  onFix: (index: number) => void;
}) {
  const { t } = useTranslation('f-feed-plus');
  if (missing.length === 0) return null;
  return (
    <div
      role="status"
      className="mt-2 flex items-center gap-2 rounded-site-sm border border-site-warning/50 bg-site-warning/10 px-3 py-2 text-xs text-site-text"
    >
      <ImageOff className="h-4 w-4 shrink-0 text-site-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        {t('alt-required', {
          count: missing.length,
          defaultValue_one: 'Alt text is required: {{count}} image still needs a description.',
          defaultValue: 'Alt text is required: {{count}} images still need a description.',
        })}
      </span>
      <button
        type="button"
        onClick={() => onFix(missing[0]!)}
        className="shrink-0 font-semibold text-site-accent hover:underline"
      >
        {t('alt-required-fix', { defaultValue: 'Describe it' })}
      </button>
    </div>
  );
}
