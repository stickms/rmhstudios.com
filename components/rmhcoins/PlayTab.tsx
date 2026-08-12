'use client';

import { Suspense, lazy } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { SignedOutLobby } from './SignedOutLobby';

/**
 * Five tables, and the switcher below can only ever show ONE of them. Importing
 * all five statically meant every visitor to this page downloaded, parsed and
 * compiled the other four — each of which drags in its own socket wiring and
 * table rendering — before the one they picked could paint.
 *
 * Lazy per table, so the page costs the table in front of you. This is safe here
 * specifically because the subtree never server-renders: `RMHCoinsPage` gates the
 * whole thing behind a client-side spinner, so there is no SSR-suspense behaviour
 * to reason about. If that gate is ever removed so the page SSRs its real
 * content, revisit these boundaries at the same time.
 */
const PlinkoGame = lazy(() => import('./PlinkoGame').then((m) => ({ default: m.PlinkoGame })));
const BlackjackGame = lazy(() =>
  import('./BlackjackGame').then((m) => ({ default: m.BlackjackGame })),
);
const HoldemGame = lazy(() => import('./HoldemGame').then((m) => ({ default: m.HoldemGame })));
const BaccaratGame = lazy(() =>
  import('./BaccaratGame').then((m) => ({ default: m.BaccaratGame })),
);
const RouletteGame = lazy(() =>
  import('./RouletteGame').then((m) => ({ default: m.RouletteGame })),
);

/**
 * Holds the table's footprint while its chunk arrives.
 *
 * The height is not decorative: the selector strip sits directly above this, and
 * an empty fallback would let the strip snap up the viewport and back down when
 * the table lands — a layout shift on every switch between tables.
 */
function TablePending() {
  const { t } = useTranslation('c-rmhcoins');
  return (
    <div className="px-3 pt-4 sm:px-4" role="status" aria-live="polite">
      <Skeleton shimmer className="h-[28rem] w-full rounded-site" />
      {/* The namespace's existing `loading` key rather than a table-specific one:
          it is already translated into all 16 shipped locales, and a new string
          here would serve every locale the English default until the translation
          pipeline caught up. */}
      <span className="sr-only">{t('loading', { defaultValue: 'Loading...' })}</span>
    </div>
  );
}

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
  /**
   * Signed-out visitors browse the same game switcher, but each game shows the
   * read-only lobby preview instead of a table: every one of these connects a
   * socket, and a socket needs a session token.
   */
  signedIn: boolean;
}

type GameChoice = 'plinko' | 'blackjack' | 'holdem' | 'baccarat' | 'roulette';

const GAME_CHOICES: readonly GameChoice[] = ['plinko', 'blackjack', 'holdem', 'baccarat', 'roulette'];

function isGameChoice(value: unknown): value is GameChoice {
  return typeof value === 'string' && (GAME_CHOICES as readonly string[]).includes(value);
}

export function PlayTab({ coins, setCoins, signedIn }: Props) {
  const { t } = useTranslation("c-rmhcoins");
  // A table invite link names its game (`?game=holdem`) because the four tables
  // share this one page — see `TableInvite`.
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const [selected, setSelected] = useState<GameChoice>(
    isGameChoice(search.game) ? search.game : 'plinko',
  );

  const games: { label: string; value: GameChoice; description: string }[] = [
    { label: 'Plinko', value: 'plinko', description: t("plinko-description", { defaultValue: "Drop the ball, pick a bin" }) },
    { label: 'Blackjack', value: 'blackjack', description: t("blackjack-description", { defaultValue: "Multiplayer card game" }) },
    { label: "Hold'em", value: 'holdem', description: t("holdem-description", { defaultValue: "No Limit Texas Poker" }) },
    { label: 'Baccarat', value: 'baccarat', description: t("baccarat-description", { defaultValue: "Casino card game" }) },
    { label: 'Roulette', value: 'roulette', description: t("roulette-description", { defaultValue: "Spin the wheel" }) },
  ];

  return (
    <div className="flex flex-col">
      {/* Game selector */}
      <div className="flex gap-2 px-3 sm:px-4 pt-4">
        {games.map((g) => (
          <button
            key={g.value}
            onClick={() => setSelected(g.value)}
            className={`flex-1 py-2.5 px-3 rounded-site-sm text-left transition-colors border ${
              selected === g.value
                ? 'border-site-accent/50 bg-site-accent-dim'
                : 'border-site-border bg-site-surface hover:bg-site-surface-hover'
            }`}
          >
            <span
              className={`text-sm font-bold block ${
                selected === g.value ? 'text-site-accent' : 'text-site-text'
              }`}
            >
              {g.label}
            </span>
            <span className="text-xs text-site-text-dim">{g.description}</span>
          </button>
        ))}
      </div>

      {/* Game content */}
      {!signedIn ? (
        <SignedOutLobby game={selected} />
      ) : (
        <Suspense fallback={<TablePending />}>
          {selected === 'plinko' && <PlinkoGame coins={coins} setCoins={setCoins} />}
          {selected === 'blackjack' && <BlackjackGame coins={coins} setCoins={setCoins} />}
          {selected === 'holdem' && <HoldemGame coins={coins} setCoins={setCoins} />}
          {selected === 'baccarat' && <BaccaratGame coins={coins} setCoins={setCoins} />}
          {selected === 'roulette' && <RouletteGame coins={coins} setCoins={setCoins} />}
        </Suspense>
      )}
    </div>
  );
}
