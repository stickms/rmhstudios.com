/**
 * Offline fallback page, served by the service worker when a navigation
 * fails while the network is unreachable. Kept intentionally free of data
 * loaders and heavy imports so the cached HTML renders standalone.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { WifiOff, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OfflineGame } from '@/components/access/OfflineGame';

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
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="glass-pane flex w-full max-w-sm flex-col items-center gap-4 rounded-site p-6 text-center sm:p-8">
        {/* Medallion: a small glass field holding the wifi-off glyph. */}
        <div className="glass-inset flex size-16 items-center justify-center rounded-full">
          <WifiOff className="h-7 w-7 text-site-text-dim" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-site-text">
          {t('offline-title', { defaultValue: "You're offline" })}
        </h1>
        <p className="text-sm text-site-text-muted">
          {t('offline-body', {
            defaultValue:
              'RMH Studios needs a connection for this page. Check your network and try again.',
          })}
        </p>
        <Button type="button" variant="accent" size="lg" onClick={() => window.location.reload()}>
          <RotateCw aria-hidden />
          {t('offline-retry', { defaultValue: 'Try again' })}
        </Button>
        <OfflineGame />
      </div>
    </main>
  );
}
