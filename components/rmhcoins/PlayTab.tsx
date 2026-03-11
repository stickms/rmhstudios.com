'use client';

import { useState } from 'react';
import { PlinkoGame } from './PlinkoGame';
import { BlackjackGame } from './BlackjackGame';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
}

type GameChoice = 'plinko' | 'blackjack';

const games: { label: string; value: GameChoice; description: string }[] = [
  { label: 'Plinko', value: 'plinko', description: 'Drop the ball, pick a bin' },
  { label: 'Blackjack', value: 'blackjack', description: 'Multiplayer card game' },
];

export function PlayTab({ coins, setCoins }: Props) {
  const [selected, setSelected] = useState<GameChoice>('plinko');

  return (
    <div className="flex flex-col">
      {/* Game selector */}
      <div className="flex gap-2 px-3 sm:px-4 pt-4">
        {games.map((g) => (
          <button
            key={g.value}
            onClick={() => setSelected(g.value)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-left transition-all border ${
              selected === g.value
                ? 'border-yellow-500/50 bg-yellow-500/10'
                : 'border-site-border bg-site-surface hover:bg-site-surface-hover'
            }`}
          >
            <span
              className={`text-sm font-bold block ${
                selected === g.value ? 'text-yellow-500' : 'text-site-text'
              }`}
            >
              {g.label}
            </span>
            <span className="text-xs text-site-text-dim">{g.description}</span>
          </button>
        ))}
      </div>

      {/* Game content */}
      {selected === 'plinko' && <PlinkoGame coins={coins} setCoins={setCoins} />}
      {selected === 'blackjack' && <BlackjackGame coins={coins} setCoins={setCoins} />}
    </div>
  );
}
