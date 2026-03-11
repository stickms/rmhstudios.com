'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import { useBaccaratStore } from '@/lib/baccarat/store';
import { getBaccaratSocket } from '@/lib/baccarat/socket';
import { C2S } from '@/lib/baccarat/events';
import type { BetType } from '@/lib/baccarat/types';

interface Props {
  coins: number;
}

const BET_OPTIONS: { type: BetType; label: string; payout: string; color: string; hoverColor: string }[] = [
  { type: 'player', label: 'Player', payout: '1:1', color: 'bg-red-600', hoverColor: 'hover:bg-red-700' },
  { type: 'banker', label: 'Banker', payout: '0.95:1', color: 'bg-blue-600', hoverColor: 'hover:bg-blue-700' },
  { type: 'tie', label: 'Tie', payout: '8:1', color: 'bg-emerald-600', hoverColor: 'hover:bg-emerald-700' },
];

const SIDE_BET_OPTIONS: { type: BetType; label: string; payout: string }[] = [
  { type: 'playerPair', label: 'P Pair', payout: '11:1' },
  { type: 'bankerPair', label: 'B Pair', payout: '11:1' },
  { type: 'playerDragon', label: 'P Dragon', payout: 'Var' },
  { type: 'bankerDragon', label: 'B Dragon', payout: 'Var' },
];

export function BaccaratControls({ coins }: Props) {
  const {
    tablePhase,
    myUserId,
    players,
    bettingCountdown,
    lastResult,
    error,
  } = useBaccaratStore();

  const [chipAmount, setChipAmount] = useState(5);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [localBets, setLocalBets] = useState<Record<BetType, number>>({
    player: 0,
    banker: 0,
    tie: 0,
    playerPair: 0,
    bankerPair: 0,
    playerDragon: 0,
    bankerDragon: 0,
  });

  const myPlayer = players.find((p) => p.userId === myUserId);
  const totalBet = Object.values(localBets).reduce((sum, v) => sum + v, 0);

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

  // Reset local bets when a new betting phase starts
  useEffect(() => {
    if (tablePhase === 'betting') {
      setLocalBets({
        player: 0,
        banker: 0,
        tie: 0,
        playerPair: 0,
        bankerPair: 0,
        playerDragon: 0,
        bankerDragon: 0,
      });
    }
  }, [tablePhase]);

  const emit = useCallback((event: string, payload?: unknown) => {
    const sock = getBaccaratSocket();
    if (sock) sock.emit(event, payload);
  }, []);

  const handlePlaceBet = (betType: BetType) => {
    const amount = Math.min(chipAmount, coins - totalBet);
    if (amount <= 0) return;
    setLocalBets((prev) => ({ ...prev, [betType]: prev[betType] + amount }));
    emit(C2S.PLACE_BET, { type: betType, amount });
  };

  // Idle state
  if (tablePhase === 'idle') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">Waiting for the next round...</p>
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
            <span className="font-bold text-red-500">{countdown}s</span>
          </div>
        )}

        {/* Main bet buttons */}
        <div className="flex gap-2">
          {BET_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => handlePlaceBet(opt.type)}
              disabled={coins - totalBet < chipAmount}
              className={`flex-1 flex flex-col items-center gap-0.5 p-3 rounded-lg ${opt.color} ${opt.hoverColor} text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="text-sm">{opt.label}</span>
              <span className="text-[10px] opacity-75">{opt.payout}</span>
            </button>
          ))}
        </div>

        {/* Side bet buttons */}
        <div className="grid grid-cols-4 gap-1.5">
          {SIDE_BET_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => handlePlaceBet(opt.type)}
              disabled={coins - totalBet < chipAmount}
              className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-site-surface border border-site-border text-site-text hover:bg-site-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-[11px] font-bold">{opt.label}</span>
              <span className="text-[9px] text-site-text-dim">{opt.payout}</span>
            </button>
          ))}
        </div>

        {/* Chip amount selector */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-xs text-site-text-dim">Chip:</span>
          <div className="flex gap-1.5">
            {[5, 25, 100, 500].map((amt) => (
              <button
                key={amt}
                onClick={() => setChipAmount(amt)}
                className={`flex-1 sm:flex-none px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                  chipAmount === amt
                    ? 'bg-red-600 border-red-500 text-white'
                    : 'bg-site-surface border-site-border text-site-text-dim hover:text-site-text hover:bg-site-surface-hover'
                }`}
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Current bets summary */}
        {totalBet > 0 && (
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-site-surface border border-site-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-site-text-dim">Your bets this round:</span>
              <div className="flex items-center gap-1">
                <CoinIcon className="w-3 h-3" />
                <span className="text-xs font-bold text-red-400">{totalBet}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(localBets) as [BetType, number][])
                .filter(([, v]) => v > 0)
                .map(([type, amount]) => (
                  <span
                    key={type}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400"
                  >
                    {type}: {amount}
                  </span>
                ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    );
  }

  // Dealing / Drawing phase
  if (tablePhase === 'dealing' || tablePhase === 'drawing') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm animate-pulse">Dealing cards...</p>
      </div>
    );
  }

  // Results phase
  if (tablePhase === 'results') {
    const payout = myPlayer?.lastPayout ?? 0;

    const resultText: Record<string, { label: string; color: string }> = {
      player: { label: 'Player Wins!', color: 'text-red-400' },
      banker: { label: 'Banker Wins!', color: 'text-blue-400' },
      tie: { label: 'Tie!', color: 'text-emerald-400' },
    };

    const r = lastResult ? resultText[lastResult.result] : null;

    return (
      <div className="text-center py-4">
        {r && <p className={`text-lg font-bold ${r.color}`}>{r.label}</p>}
        {lastResult?.isNatural && (
          <p className="text-xs text-red-400 mt-0.5">Natural!</p>
        )}
        {payout > 0 && (
          <p className="text-sm text-site-text-dim mt-1 animate-bounce">
            +{payout} coins
          </p>
        )}
        {totalBet > 0 && payout === 0 && (
          <p className="text-sm text-site-text-dim mt-1">
            -{totalBet} coins
          </p>
        )}
        <p className="text-xs text-site-text-dim mt-2">Next round starting soon...</p>
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-center text-site-text-dim py-4">
      <p className="text-sm animate-pulse">Dealing...</p>
    </div>
  );
}
