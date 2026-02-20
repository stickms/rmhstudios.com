/**
 * VictoryScreen.tsx — Signal Forge
 * ─────────────────────────────────
 * Shown after winning a combat. Displays score, currency, and relics
 * earned. Provides a button to proceed to the next floor.
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import type { Relic } from '@/lib/signal-forge';

interface Props {
  floor: number;
  score: number;
  currency: number;
  defeatedBossName?: string;
  ownedRelics: Relic[];
  onNextFloor: () => void;
}

export function VictoryScreen({ floor, score, currency, defeatedBossName, ownedRelics, onNextFloor }: Props) {
  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-green-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
        <h2 className="text-3xl font-bold text-green-400 mb-4">Floor {floor} Cleared!</h2>
        {defeatedBossName && (
          <p className="text-yellow-400 font-bold mb-2">🏆 Boss defeated: {defeatedBossName}</p>
        )}
        <div className="space-y-2 mb-6 text-slate-300">
          <p>Score: <span className="text-green-400 font-bold">{score}</span></p>
          <p>Currency: <span className="text-yellow-400 font-bold">{currency} 💰</span></p>
          <p>Relics: <span className="text-purple-400 font-bold">{ownedRelics.length}</span></p>
        </div>
        <Button
          onClick={onNextFloor}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
