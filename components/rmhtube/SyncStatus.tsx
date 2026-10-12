'use client';

/**
 * The "am I in sync?" chip in the control bar, with the numbers behind it.
 *
 * A room that desyncs silently is the failure people remember; one that says
 * "In sync" — and lets you see the offset, the clock and the round trip when
 * you doubt it — is one they trust. The chip polls `syncStats` (written by the
 * player's tick) every half second and re-renders only when its word changes,
 * or while the panel is open.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { usePopPresence } from '@/hooks/usePopPresence';
import { getBestRtt, getClockOffset } from '@/lib/rmhtube/clock';
import { requestResync, syncHealth, syncStats, type SyncHealth } from '@/lib/rmhtube/sync-stats';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

const POLL_MS = 500;

const DOT: Record<SyncHealth, string> = {
  idle: 'bg-(--app-text-dim)',
  leader: 'bg-(--app-info)',
  paused: 'bg-(--app-warning)',
  buffering: 'bg-(--app-warning)',
  synced: 'bg-(--app-success)',
  'catching-up': 'bg-(--app-warning)',
};

function ms(seconds: number | null): string {
  return seconds === null ? '—' : `${seconds >= 0 ? '+' : ''}${Math.round(seconds * 1000)} ms`;
}

export default function SyncStatus() {
  const { t } = useTranslation('c-rmhtube');
  const [health, setHealth] = useState<SyncHealth>('idle');
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const panel = usePopPresence(open);
  const isLive = useRmhTubeStore((s) => s.room?.videoState.mode === 'live');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setHealth(syncHealth(syncStats, Date.now()));
      if (open) setTick((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (health === 'idle' && !open) return null;

  const label: Record<SyncHealth, string> = {
    idle: t('sync-idle', { defaultValue: 'Not playing' }),
    leader: t('sync-leader', { defaultValue: 'You lead' }),
    paused: t('sync-paused-local', { defaultValue: 'You paused' }),
    buffering: t('sync-buffering', { defaultValue: 'Buffering' }),
    synced: t('sync-synced', { defaultValue: 'In sync' }),
    'catching-up': t('sync-catching-up', { defaultValue: 'Catching up' }),
  };
  const rtt = getBestRtt();
  const rows: Array<[string, string]> = [
    [t('sync-stat-offset', { defaultValue: 'Offset from room' }), ms(syncStats.driftS)],
    [t('sync-stat-rate', { defaultValue: 'Playback rate' }), `${syncStats.rate.toFixed(2)}x`],
    [t('sync-stat-seeks', { defaultValue: 'Correction seeks' }), String(syncStats.seeks)],
    [t('sync-stat-seek-cost', { defaultValue: 'Seek cost' }), ms(syncStats.seekLeadS || null)],
    [t('sync-stat-clock', { defaultValue: 'Clock offset' }), `${Math.round(getClockOffset())} ms`],
    [t('sync-stat-rtt', { defaultValue: 'Round trip' }), rtt === null ? '—' : `${Math.round(rtt)} ms`],
  ];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
        title={t('sync-status-title', { defaultValue: 'Sync status' })}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${DOT[health]}`} aria-hidden />
        <span className="hidden md:inline">{label[health]}</span>
        <span className="sr-only md:hidden">{label[health]}</span>
      </button>

      {panel.present && (
        <div
          role="dialog"
          aria-label={t('sync-status-title', { defaultValue: 'Sync status' })}
          data-motion="pop"
          data-state={panel.state}
          className="absolute bottom-full right-0 z-50 mb-1 w-60 origin-bottom-right rounded-lg border border-(--app-border) bg-(--app-surface) p-3 shadow-lg"
        >
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-(--app-text)">
            <span className={`inline-block h-2 w-2 rounded-full ${DOT[health]}`} aria-hidden />
            {label[health]}
          </p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-(--app-text-dim)">{k}</dt>
                <dd className="text-right tabular-nums text-(--app-text-muted)">{v}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={() => {
              requestResync();
              setOpen(false);
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors bg-(--app-accent-dim) text-(--app-accent) hover:bg-(--app-surface-hover)"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {isLive
              ? t('sync-jump-live', { defaultValue: 'Jump to live' })
              : t('sync-resync', { defaultValue: 'Resync now' })}
          </button>
        </div>
      )}
    </div>
  );
}
