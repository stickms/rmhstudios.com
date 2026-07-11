'use client';

import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Slim, non-blocking banner that appears when the browser goes offline, plus a
 * brief "back online" confirmation when the connection returns. Gives clear,
 * global feedback on dropped / flaky connections (common on mobile and slow
 * networks). Mounted once in the site shell; renders nothing while connected.
 */
export function OfflineBanner() {
  const { t } = useTranslation('common');
  const online = useOnlineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowBackOnline(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowBackOnline(true);
      const id = setTimeout(() => setShowBackOnline(false), 3000);
      return () => clearTimeout(id);
    }
  }, [online]);

  if (online && !showBackOnline) return null;

  const offline = !online;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 pb-2 text-center text-sm font-medium text-white ${
        offline ? 'bg-site-danger' : 'bg-site-success'
      }`}
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
    >
      {offline ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {t('offline-banner', {
              defaultValue: "You're offline — some things may not work until you reconnect.",
            })}
          </span>
        </>
      ) : (
        <span>{t('back-online-banner', { defaultValue: 'Back online.' })}</span>
      )}
    </div>
  );
}
