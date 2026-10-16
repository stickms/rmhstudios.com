'use client';

/**
 * The only party UI on the room's first paint: a small button. The panel and
 * the timed-comment overlay are separate chunks, loaded on click / when idle.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PartyPopper } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { usePartyStore } from '@/lib/rmhtube/party-store';

const Panel = lazy(() => import('./WatchPartyPanel'));
const Overlay = lazy(() => import('./PartyOverlay'));

export default function PartyLauncher() {
  const { t } = useTranslation('f-watch');
  const [open, setOpen] = useState(false);
  const roomId = useRmhTubeStore((s) => s.room?.roomId);
  const live = usePartyStore(
    (s) => s.party?.prediction?.status === 'open' || (!!s.party?.bingo && !s.party.bingo.winner),
  );

  // Late joiners and reconnects ask the hub for the current party state.
  useEffect(() => {
    if (roomId) emit(C2S.PARTY_SYNC, {});
  }, [roomId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t('party-title', { defaultValue: 'Watch party games' })}
        className="relative rounded-md p-2 text-(--app-text-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)"
      >
        <PartyPopper className="h-5 w-5" aria-hidden />
        {live && (
          <span
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-(--app-accent)"
            aria-hidden
          />
        )}
        <span className="sr-only">{t('party-title', { defaultValue: 'Watch party games' })}</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <Panel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

/** Timed comments + commentary lines over the video, mounted once the page is idle. */
export function PartyOverlaySlot() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 3000 });
      return () =>
        (window as Window & { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(id);
    }
    const id = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(id);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <Overlay />
    </Suspense>
  );
}
