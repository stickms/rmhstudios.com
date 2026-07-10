/**
 * MinigameRenderer — Dynamically loads minigame components using React.lazy().
 *
 * Uses Suspense for a loading fallback and shows an error fallback
 * for unknown minigame IDs. Reads player info from Zustand store
 * and passes it to the loaded minigame component.
 *
 * Provides the `useHeaderTimer` and `useMinigameRound` hooks that
 * minigame components use to drive the shared header timer ring and
 * the footer round counter. These write directly to the Zustand store,
 * so both RMHboxHeader and GameShell react automatically.
 *
 * Props:
 *   minigameId: string — The ID of the minigame to render
 */
'use client';

import { lazy, Suspense, useCallback, useEffect, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Gamepad2, HelpCircle } from 'lucide-react';
import { useRMHboxStore, type TimerInfo, type MinigameRoundInfo } from '@/lib/rmhbox/store';

// ─── Minigame ↔ Shell Interface ──────────────────────────────────

/**
 * Hook for minigame components to control the header timer ring.
 *
 * - `startTimer(total, remaining?)` — starts a new timed phase.
 *     `total` sets the full-circle baseline; `remaining` defaults to `total`.
 * - `tickTimer(remaining)` — updates the remaining seconds (called on TIMER_TICK).
 * - `clearTimer()` — hides the timer ring.
 *
 * The hook automatically clears the timer on unmount.
 */
export function useHeaderTimer() {
  const setTimerInfo = useRMHboxStore((s) => s.setTimerInfo);

  const startTimer = useCallback(
    (total: number, remaining?: number) => {
      setTimerInfo({ total, remaining: remaining ?? total, paused: false, infinite: false, showSkip: false });
    },
    [setTimerInfo],
  );

  const tickTimer = useCallback(
    (remaining: number) => {
      const prev = useRMHboxStore.getState().timerInfo;
      setTimerInfo({
        total: prev?.total ?? remaining,
        remaining,
        paused: prev?.paused ?? false,
        infinite: prev?.infinite ?? false,
        showSkip: prev?.showSkip ?? false,
      });
    },
    [setTimerInfo],
  );

  const clearTimer = useCallback(() => {
    setTimerInfo(null);
  }, [setTimerInfo]);

  // Auto-clear on unmount
  useEffect(() => () => { setTimerInfo(null); }, [setTimerInfo]);

  return { startTimer, tickTimer, clearTimer };
}

/**
 * Hook for minigame components to control the footer round counter.
 *
 * - `setRound(current, total)` — sets the sub-round display (e.g. "Round 2/3").
 * - `clearRound()` — reverts to showing the session-level round number.
 *
 * The hook automatically clears on unmount.
 */
export function useMinigameRound() {
  const setMinigameRound = useRMHboxStore((s) => s.setMinigameRound);

  const setRound = useCallback(
    (current: number, total: number) => {
      setMinigameRound({ current, total });
    },
    [setMinigameRound],
  );

  const clearRound = useCallback(() => {
    setMinigameRound(null);
  }, [setMinigameRound]);

  // Auto-clear on unmount
  useEffect(() => () => { setMinigameRound(null); }, [setMinigameRound]);

  return { setRound, clearRound };
}

/** Re-export store types for convenience */
export type { TimerInfo, MinigameRoundInfo };

/** Common props passed to every minigame component */
export interface MinigameProps {
  playerId: string;
  playerName: string;
}

interface MinigameRendererProps {
  minigameId: string;
}

/** Stub component factory — creates a simple placeholder for each minigame. */
function createStub(name: string): ComponentType<MinigameProps> {
  const Stub = () => {
    const { t } = useTranslation("c-rmhbox");
    return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-(--rmhbox-text)">
      <Gamepad2 className="h-10 w-10 text-(--rmhbox-text-muted)" />
      <h3 className="text-xl font-bold">{name}</h3>
      <p className="text-sm text-(--rmhbox-text-muted)">{t("minigame-coming-soon", { defaultValue: "Minigame coming soon…" })}</p>
    </div>
    );
  };
  Stub.displayName = name;
  return Stub;
}

/**
 * Map of minigame IDs to lazy-loaded components.
 * Implemented minigames import the real component; others use stubs.
 */
const MINIGAME_COMPONENTS: Record<string, React.LazyExoticComponent<ComponentType<MinigameProps>>> = {
  'rhyme-time':             lazy(() => import('./rhyme-time/RhymeTimeGame')),
  'undercover-agent':       lazy(() => import('./undercover-agent/UndercoverAgentGame')),
  'category-crash':         lazy(() => import('./category-crash/CategoryCrashGame')),
  'wiki-race':              lazy(() => import('./wiki-race/WikiRaceGame')),
  'wit-war':                lazy(() => import('./wit-war/WitWarGame')),
  'fact-or-friction':       lazy(() => import('./fact-or-friction/FactOrFrictionGame')),
  'undercover-editor':      lazy(() => import('./undercover-editor/UndercoverEditorGame')),
  'minimalist-masterpiece': lazy(() => import('./minimalist-masterpiece/MinimalistMasterpieceGame')),
  'emoji-cinema':           lazy(() => import('./emoji-cinema/EmojiCinemaGame')),
  'sequence-sam':           lazy(() => Promise.resolve({ default: createStub('Sequence Sam') })),
  'human-keyboard':         lazy(() => Promise.resolve({ default: createStub('Human Keyboard') })),
  'cursor-curling':         lazy(() => Promise.resolve({ default: createStub('Cursor Curling') })),
  'human-tetris':           lazy(() => Promise.resolve({ default: createStub('Human Tetris') })),
  'identity-crisis':        lazy(() => Promise.resolve({ default: createStub('Identity Crisis') })),
  'ranking-file':           lazy(() => Promise.resolve({ default: createStub('Ranking File') })),
  'pixel-pushers':          lazy(() => Promise.resolve({ default: createStub('Pixel Pushers') })),
  'scroll-soul':            lazy(() => Promise.resolve({ default: createStub('Scroll & Soul') })),
};

/** Loading fallback shown while the component loads. */
function LoadingFallback() {
  const { t } = useTranslation("c-rmhbox");
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-(--rmhbox-text-muted)">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span>{t("loading-minigame", { defaultValue: "Loading minigame…" })}</span>
    </div>
  );
}

/** Error fallback for unknown minigame IDs. */
function UnknownMinigame({ id }: { id: string }) {
  const { t } = useTranslation("c-rmhbox");
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <HelpCircle className="h-10 w-10 text-(--rmhbox-danger)" />
      <h3 className="text-lg font-bold text-(--rmhbox-danger)">{t("unknown-minigame", { defaultValue: "Unknown Minigame" })}</h3>
      <p className="text-sm text-(--rmhbox-text-muted)">
        {t("no-component-found", { defaultValue: "No component found for \"{{id}}\"", id })}
      </p>
    </div>
  );
}

export default function MinigameRenderer({ minigameId }: MinigameRendererProps) {
  const lobby = useRMHboxStore((s) => s.lobby);
  const LazyComponent = MINIGAME_COMPONENTS[minigameId];

  if (!LazyComponent) {
    return <UnknownMinigame id={minigameId} />;
  }

  const playerId = lobby?.myUserId ?? '';
  const playerName = lobby?.players.find((p) => p.userId === playerId)?.userName ?? '';

  return (
    <Suspense fallback={<LoadingFallback />}>
      <LazyComponent playerId={playerId} playerName={playerName} />
    </Suspense>
  );
}
