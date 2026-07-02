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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-site-bg px-6 text-center">
      <WifiOff className="h-12 w-12 text-site-text-dim" aria-hidden />
      <h1 className="text-2xl font-bold text-site-text">
        {t('offline-title', { defaultValue: "You're offline" })}
      </h1>
      <p className="max-w-sm text-sm text-site-text-muted">
        {t('offline-body', {
          defaultValue:
            'RMH Studios needs a connection for this page. Check your network and try again.',
        })}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-site-accent px-5 py-2.5 text-sm font-semibold text-site-accent-fg transition-opacity hover:opacity-90"
      >
        <RotateCw className="h-4 w-4" aria-hidden />
        {t('offline-retry', { defaultValue: 'Try again' })}
      </button>
    </div>
  );
}
