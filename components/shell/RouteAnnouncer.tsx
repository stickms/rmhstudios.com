import { useTranslation } from 'react-i18next';

/**
 * The two polite live regions the route announcer writes into, in turn, after a client-side navigation
 * (lib/router/route-announce-client.ts): two, so a repeated title is a fresh insertion into an emptied region
 * and is not coalesced into silence. They render empty and React never updates them, so the announcer's direct
 * writes are not overwritten. Visually hidden, in flow, not fixed or edge-pinned. `data-fallback` is what the
 * first says when a page names no title.
 */
export function RouteAnnouncer() {
  const { t } = useTranslation('route-announce');
  return (
    <>
      <div
        id="route-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-fallback={t('untitled-page', { defaultValue: 'New page' })}
      />
      <div id="route-announcer-alt" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  );
}
