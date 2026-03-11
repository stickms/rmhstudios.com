'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import { useRouletteStore } from '@/lib/roulette/store';
import { getRouletteSocket } from '@/lib/roulette/socket';
import { C2S } from '@/lib/roulette/events';
import { getNumberColor, getOutsideBetNumbers } from '@/lib/roulette/logic';
import type { BetType } from '@/lib/roulette/logic';
import { setSelectedChipValue, getSelectedChipValue } from './RouletteTable';

interface Props {
  coins: number;
}

const CHIP_VALUES = [1, 5, 25, 100, 500];

const QUICK_BETS: { type: BetType; label: string; color: string }[] = [
  { type: 'red', label: 'Red', color: 'bg-red-600 hover:bg-red-500 text-white' },
  { type: 'black', label: 'Black', color: 'bg-gray-800 hover:bg-gray-700 text-white' },
  { type: 'odd', label: 'Odd', color: 'bg-violet-700 hover:bg-violet-600 text-white' },
  { type: 'even', label: 'Even', color: 'bg-violet-700 hover:bg-violet-600 text-white' },
  { type: 'low', label: '1-18', color: 'bg-site-surface hover:bg-site-surface-hover text-site-text border border-site-border' },
  { type: 'high', label: '19-36', color: 'bg-site-surface hover:bg-site-surface-hover text-site-text border border-site-border' },
];

export function RouletteControls({ coins }: Props) {
  const {
    tablePhase,
    bettingCountdown,
    stagedBets,
    spinResult,
    lastRoundResult,
    myUserId,
    players,
    error,
  } = useRouletteStore();

  const addStagedBet = useRouletteStore((s) => s.addStagedBet);
  const clearStagedBets = useRouletteStore((s) => s.clearStagedBets);

  const [selectedChip, setSelectedChip] = useState(5);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Keep the shared chip value in sync
  useEffect(() => {
    setSelectedChipValue(selectedChip);
  }, [selectedChip]);

  // Betting countdown timer
  useEffect(() => {
    if (tablePhase === 'betting' && bettingCountdown !== null) {
      setCountdown(bettingCountdown);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 0) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [tablePhase, bettingCountdown]);

  const totalStagedBet = stagedBets.reduce((sum, b) => sum + b.amount, 0);
  const myPlayer = players.find((p) => p.userId === myUserId);
  const totalConfirmedBet = myPlayer?.totalBetThisRound ?? 0;
  const totalBet = totalStagedBet + totalConfirmedBet;

  const handleClearBets = () => {
    clearStagedBets();
    const sock = getRouletteSocket();
    if (sock) sock.emit(C2S.CLEAR_BETS);
  };

  const handleQuickBet = (type: BetType) => {
    if (tablePhase !== 'betting') return;
    const chipValue = getSelectedChipValue();
    if (chipValue > coins) return;
    const numbers = getOutsideBetNumbers(type);
    addStagedBet({ type, numbers, amount: chipValue });
    const sock = getRouletteSocket();
    if (sock) {
      sock.emit(C2S.PLACE_BET, { type, numbers, amount: chipValue });
    }
  };

  // Idle state
  if (tablePhase === 'idle') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">Waiting for next round...</p>
      </div>
    );
  }

  // Betting phase
  if (tablePhase === 'betting') {
    return (
      <div className="flex flex-col gap-3">
        {countdown !== null && (
          <div className="text-center">
            <span className="text-sm text-site-text-dim">Betting closes in </span>
            <span className="font-bold text-violet-400">{countdown}s</span>
          </div>
        )}

        {/* Chip selector */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-site-text-dim text-center">Select chip value</span>
          <div className="flex justify-center gap-2">
            {CHIP_VALUES.map((val) => (
              <button
                key={val}
                onClick={() => setSelectedChip(val)}
                disabled={val > coins}
                className={`relative w-11 h-11 rounded-full font-bold text-xs transition-all ${
                  selectedChip === val
                    ? 'bg-violet-600 text-white ring-2 ring-violet-400 ring-offset-2 ring-offset-site-bg scale-110'
                    : 'bg-site-surface border-2 border-site-border text-site-text hover:border-violet-500/50'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-site-text-dim text-center">Place your bets on the board above</p>

        {/* Quick bet buttons */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-site-text-dim text-center">Quick bets</span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {QUICK_BETS.map(({ type, label, color }) => (
              <button
                key={type}
                onClick={() => handleQuickBet(type)}
                disabled={selectedChip > coins}
                className={`px-2 py-1.5 text-xs font-bold rounded-lg transition-all ${color} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Current bets summary */}
        {(stagedBets.length > 0 || totalConfirmedBet > 0) && (
          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-site-surface border border-site-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-site-text-dim">Your bets</span>
              <div className="flex items-center gap-1">
                <CoinIcon className="w-3.5 h-3.5" />
                <span className="text-sm font-bold text-violet-400">{totalBet}</span>
              </div>
            </div>
            {stagedBets.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {stagedBets.map((bet, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-0.5 text-[10px] bg-violet-600/20 text-violet-300 rounded-full px-1.5 py-0.5"
                  >
                    {bet.type === 'straight' ? `#${bet.numbers[0]}` : bet.type}: {bet.amount}
                  </span>
                ))}
              </div>
            )}
            <Button
              onClick={handleClearBets}
              variant="outline"
              className="w-full text-xs rounded-lg"
            >
              Clear All Bets
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    );
  }

  // Spinning phase
  if (tablePhase === 'spinning') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm font-bold text-violet-400 animate-pulse">
          No more bets! Spinning...
        </p>
      </div>
    );
  }

  // Results phase
  if (tablePhase === 'results') {
    const myPayout = lastRoundResult?.payouts.find((p) => p.userId === myUserId);
    const resultColor = spinResult !== null ? getNumberColor(spinResult) : 'green';

    return (
      <div className="flex flex-col items-center gap-3 py-4">
        {/* Winning number */}
        {spinResult !== null && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-site-text-dim uppercase tracking-wider">Winning Number</span>
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg ${
                resultColor === 'red' ? 'bg-red-600'
                : resultColor === 'green' ? 'bg-emerald-600'
                : 'bg-gray-800'
              }`}
            >
              {spinResult}
            </div>
          </div>
        )}

        {/* Payout info */}
        {myPayout ? (
          <div className="text-center">
            {myPayout.netGain > 0 ? (
              <>
                <p className="text-lg font-bold text-emerald-400">You win!</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <CoinIcon className="w-4 h-4" />
                  <span className="text-sm text-site-text-dim">+{myPayout.payout} coins</span>
                </div>
              </>
            ) : myPayout.netGain === 0 ? (
              <p className="text-lg font-bold text-blue-400">Push</p>
            ) : (
              <p className="text-lg font-bold text-red-400">Better luck next time</p>
            )}
          </div>
        ) : totalBet > 0 ? (
          <p className="text-sm text-red-400">No wins this round</p>
        ) : null}

        <p className="text-xs text-site-text-dim">Next round starting soon...</p>
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-center text-site-text-dim py-4">
      <p className="text-sm animate-pulse">Loading...</p>
    </div>
  );
}
