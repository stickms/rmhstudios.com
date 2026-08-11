'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { PlinkoGame } from './PlinkoGame';
import { BlackjackGame } from './BlackjackGame';
import { HoldemGame } from './HoldemGame';
import { BaccaratGame } from './BaccaratGame';
import { RouletteGame } from './RouletteGame';
import { SignedOutLobby } from './SignedOutLobby';

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
        <>
          {selected === 'plinko' && <PlinkoGame coins={coins} setCoins={setCoins} />}
          {selected === 'blackjack' && <BlackjackGame coins={coins} setCoins={setCoins} />}
          {selected === 'holdem' && <HoldemGame coins={coins} setCoins={setCoins} />}
          {selected === 'baccarat' && <BaccaratGame coins={coins} setCoins={setCoins} />}
          {selected === 'roulette' && <RouletteGame coins={coins} setCoins={setCoins} />}
        </>
      )}
    </div>
  );
}
