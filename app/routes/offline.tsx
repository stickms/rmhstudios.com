/**
 * Offline fallback page, served by the service worker when a navigation
 * fails while the network is unreachable. Kept intentionally free of data
 * loaders and heavy imports so the cached HTML renders standalone.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { WifiOff, RotateCw } from 'lucide-react';

export const Route = createFileRoute('/offline')({
  head: () => ({
    meta: [
      { title: 'Offline | RMH Studios' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OfflinePage,
});

function OfflinePage() {
  const { t } = useTranslation('common');
  return (
    // No opaque full-viewport fill — the body already paints the theme aurora,
    // so the offline card floats on it as glass. Pure CSS, zero network needed.
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="glass-pane flex w-full max-w-sm flex-col items-center gap-4 rounded-site p-8 text-center">
        {/* Etched medallion: a recessed well cradling the wifi-off glyph. */}
        <div className="glass-inset flex h-16 w-16 items-center justify-center rounded-full">
          <WifiOff className="h-7 w-7 text-site-text-dim" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold text-site-text">
          {t('offline-title', { defaultValue: "You're offline" })}
        </h1>
        <p className="text-sm text-site-text-muted">
          {t('offline-body', {
            defaultValue:
              'RMH Studios needs a connection for this page. Check your network and try again.',
          })}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-site-text px-5 py-2.5 text-sm font-semibold text-site-bg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-text/25"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          {t('offline-retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    </div>
  );
}
