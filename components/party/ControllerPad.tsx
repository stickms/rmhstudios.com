'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { startControllerPad, type PadButton } from '@/lib/controller/client';
import { cn } from '@/lib/utils';

type Status = 'connecting' | 'ready' | 'notfound' | 'full' | 'closed';

/** Phone side of E3: a d-pad and two buttons, no cursor tracking, pointer events only. */
export function ControllerPad({ code }: { code: string }) {
  const { t } = useTranslation('f-party');
  const [status, setStatus] = useState<Status>('connecting');
  const [slot, setSlot] = useState(0);
  const pad = useRef<ReturnType<typeof startControllerPad> | null>(null);

  useEffect(() => {
    const p = startControllerPad(code.toUpperCase(), {
      onJoined: (s) => {
        setSlot(s);
        setStatus('ready');
      },
      onError: (c) => setStatus(c === 'FULL' ? 'full' : 'notfound'),
      onClosed: () => setStatus('closed'),
    });
    pad.current = p;
    return () => p.stop();
  }, [code]);

  const hold = (b: PadButton) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      navigator.vibrate?.(8);
      pad.current?.press(b, true);
    },
    onPointerUp: () => pad.current?.press(b, false),
    onPointerCancel: () => pad.current?.press(b, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const key =
    'glass-fill flex select-none items-center justify-center text-site-text active:bg-site-accent active:text-site-accent-fg';

  if (status !== 'ready') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-site-bg p-6 text-center text-site-text">
        <p>
          {status === 'connecting'
            ? t('pad-connecting', { defaultValue: 'Connecting to the screen...' })
            : status === 'full'
              ? t('pad-full', { defaultValue: 'This game already has four controllers.' })
              : status === 'closed'
                ? t('pad-closed', { defaultValue: 'The screen closed the session.' })
                : t('pad-notfound', {
                    defaultValue: 'That code is not active. Scan the QR on the screen again.',
                  })}
        </p>
      </main>
    );
  }

  return (
    <main
      className="relative flex min-h-dvh touch-none select-none items-center justify-between gap-6 bg-site-bg p-6 text-site-text"
    >
      <p className="absolute left-3 top-2 text-xs text-site-text-muted">
        {t('pad-player', { defaultValue: 'Player {{n}}', n: slot + 1 })}
      </p>
      <div className="grid grid-cols-3 grid-rows-3 gap-1" style={{ touchAction: 'none' }}>
        <span />
        <button
          type="button"
          aria-label={t('pad-up', { defaultValue: 'Up' })}
          className={cn(key, 'h-20 w-20 rounded-site')}
          {...hold('up')}
        >
          ▲
        </button>
        <span />
        <button
          type="button"
          aria-label={t('pad-left', { defaultValue: 'Left' })}
          className={cn(key, 'h-20 w-20 rounded-site')}
          {...hold('left')}
        >
          ◀
        </button>
        <span />
        <button
          type="button"
          aria-label={t('pad-right', { defaultValue: 'Right' })}
          className={cn(key, 'h-20 w-20 rounded-site')}
          {...hold('right')}
        >
          ▶
        </button>
        <span />
        <button
          type="button"
          aria-label={t('pad-down', { defaultValue: 'Down' })}
          className={cn(key, 'h-20 w-20 rounded-site')}
          {...hold('down')}
        >
          ▼
        </button>
        <span />
      </div>
      <div className="flex items-end gap-4">
        <button
          type="button"
          aria-label={t('pad-b', { defaultValue: 'Button B' })}
          className={cn(key, 'mb-10 h-24 w-24 rounded-full text-xl font-bold')}
          {...hold('b')}
        >
          B
        </button>
        <button
          type="button"
          aria-label={t('pad-a', { defaultValue: 'Button A' })}
          className={cn(key, 'h-24 w-24 rounded-full text-xl font-bold')}
          {...hold('a')}
        >
          A
        </button>
      </div>
    </main>
  );
}
