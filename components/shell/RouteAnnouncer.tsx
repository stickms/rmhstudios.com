import { useTranslation } from 'react-i18next';

/**
 * The one polite live region the route announcer writes into after a client-side navigation
 * (lib/router/route-announce-client.ts). It renders empty and React never updates it, so the
 * announcer's direct writes are not overwritten. Visually hidden, in flow, not fixed or
 * edge-pinned. `data-fallback` is what it says when a page names no title.
 */
export function RouteAnnouncer() {
  const { t } = useTranslation('route-announce');
  return (
    <div
      id="route-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-fallback={t('untitled-page', { defaultValue: 'New page' })}
    />
  );
}
