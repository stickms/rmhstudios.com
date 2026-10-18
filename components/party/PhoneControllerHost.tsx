'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, X } from 'lucide-react';
import { QrCode } from '@/components/feed/QrCode';
import { padUrl, startControllerHost, type ControllerSink } from '@/lib/controller/client';

/**
 * Big-screen side of E3: a corner button that opens a QR + code. A phone that
 * scans it becomes a d-pad and two buttons feeding `sink` (the game's own
 * input layer), relayed over the existing socket hub.
 */
export function PhoneControllerHost({ sink }: { sink: ControllerSink }) {
  const { t } = useTranslation('f-party');
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [pads, setPads] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFailed(false);
    const stop = startControllerHost(sink, {
      onCode: setCode,
      onPads: setPads,
      onError: () => setFailed(true),
    });
    return () => {
      stop();
      setCode(null);
      setPads(0);
    };
  }, [open, sink]);

  return (
    <div data-floating="feature-overlay" className="absolute bottom-3 left-3 z-30">
      {open ? (
        <div className="glass-overlay w-56 space-y-2 rounded-site p-3 text-center text-site-text">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('host-close', { defaultValue: 'Close phone controller' })}
            className="ml-auto block"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          {failed ? (
            <p className="text-xs">
              {t('host-failed', { defaultValue: 'Could not start a controller session.' })}
            </p>
          ) : code ? (
            <>
              <div className="mx-auto w-fit rounded-site bg-white p-2">
                <QrCode value={padUrl(window.location.origin, code)} size={140} />
              </div>
              <p className="font-mono text-lg tracking-widest">{code}</p>
              <p className="text-xs text-site-text-muted">
                {pads
                  ? t('host-pads', { defaultValue: '{{n}} phone connected', n: pads })
                  : t('host-scan', {
                      defaultValue: 'Scan with your phone, or open /controller and enter the code.',
                    })}
              </p>
            </>
          ) : (
            <p className="text-xs">{t('host-connecting', { defaultValue: 'Connecting...' })}</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="glass-overlay flex items-center gap-1.5 rounded-site px-2.5 py-1.5 text-xs font-semibold text-site-text"
        >
          <Smartphone className="h-3.5 w-3.5" aria-hidden />
          {t('host-open', { defaultValue: 'Phone controller' })}
        </button>
      )}
    </div>
  );
}
