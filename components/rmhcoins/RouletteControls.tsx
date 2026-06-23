'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import { useRouletteStore } from '@/lib/roulette/store';
import { getRouletteSocket } from '@/lib/roulette/socket';
import { C2S } from '@/lib/roulette/events';
import { getNumberColor, getOutsideBetNumbers, numberLabel, DOUBLE_ZERO } from '@/lib/roulette/logic';
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

  const { t } = useTranslation("c-rmhcoins");

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

  // Only use staged bets for total — server bets are the same ones echoed back
  const totalBet = stagedBets.reduce((sum, b) => sum + b.amount, 0);

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
        <p className="text-sm">{t("waiting-for-next-round", { defaultValue: "Waiting for next round..." })}</p>
      </div>
    );
  }

  // Betting phase
  if (tablePhase === 'betting') {
    const isLow = countdown !== null && countdown <= 5;

    return (
      <div className="flex flex-col gap-2.5">
        {countdown !== null && (
          <div className="text-center">
            <span className="text-sm text-site-text-dim">{t("betting-closes-in", { defaultValue: "Betting closes in " })}</span>
            <span className={`font-bold text-lg tabular-nums ${isLow ? 'text-violet-300 animate-pulse' : 'text-violet-400'}`}>
              {countdown}s
            </span>
          </div>
        )}

        {/* Chip selector — circular chips, scrollable on tiny screens */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-site-text-dim text-center">{t("select-chip-value", { defaultValue: "Select chip value" })}</span>
          <div className="flex justify-center gap-2 py-1 overflow-x-auto">
            {CHIP_VALUES.map((val) => (
              <button
                key={val}
                onClick={() => setSelectedChip(val)}
                disabled={val > coins}
                className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full font-bold text-xs shrink-0 transition-all active:scale-90 ${
                  selectedChip === val
                    ? 'bg-violet-600 text-white ring-2 ring-violet-400 ring-offset-1 ring-offset-site-bg'
                    : 'bg-site-surface border-2 border-site-border text-site-text hover:border-violet-500/50'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {val}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-site-text-dim text-center">{t("place-bets-hint", { defaultValue: "Place your bets on the board above" })}</p>
        </div>

        {/* Quick bet buttons — 3 columns on mobile, 6 on desktop */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-site-text-dim text-center">{t("quick-bets", { defaultValue: "Quick bets" })}</span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {QUICK_BETS.map(({ type, label, color }) => (
              <button
                key={type}
                onClick={() => handleQuickBet(type)}
                disabled={selectedChip > coins}
                className={`min-h-10 px-2 py-2 text-xs font-bold rounded-xl transition-all active:scale-95 ${color} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Current bets summary */}
        {stagedBets.length > 0 && (
          <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-site-surface border border-site-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-site-text-dim">{t("your-bets", { defaultValue: "Your bets" })}</span>
              <div className="flex items-center gap-1">
                <CoinIcon className="w-3.5 h-3.5" />
                <span className="text-sm font-bold text-violet-400">{totalBet}</span>
              </div>
            </div>
            {stagedBets.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {stagedBets.map((bet, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-0.5 text-[10px] bg-violet-600/20 text-violet-300 rounded-full px-1.5 py-0.5"
                  >
                    {bet.type === 'straight' ? `#${numberLabel(bet.numbers[0])}` : bet.type}: {bet.amount}
                  </span>
                ))}
              </div>
            )}
            <Button
              onClick={handleClearBets}
              variant="outline"
              className="w-full min-h-10 text-xs rounded-xl"
            >
              {t("clear-all-bets", { defaultValue: "Clear All Bets" })}
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
          {t("no-more-bets-spinning", { defaultValue: "No more bets! Spinning..." })}
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
            <span className="text-xs text-site-text-dim uppercase tracking-wider">{t("winning-number", { defaultValue: "Winning Number" })}</span>
            <div
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold text-white shadow-lg ${
                resultColor === 'red' ? 'bg-red-600'
                : resultColor === 'green' ? 'bg-emerald-600'
                : 'bg-gray-800'
              }`}
            >
              {numberLabel(spinResult)}
            </div>
          </div>
        )}

        {/* Payout info */}
        {myPayout ? (
          <div className="text-center">
            {myPayout.netGain > 0 ? (
              <>
                <p className="text-lg font-bold text-emerald-400">{t("you-win", { defaultValue: "You win!" })}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <CoinIcon className="w-4 h-4" />
                  <span className="text-sm text-site-text-dim">+{myPayout.payout} {t("coins", { defaultValue: "coins" })}</span>
                </div>
              </>
            ) : myPayout.netGain === 0 ? (
              <p className="text-lg font-bold text-blue-400">{t("push", { defaultValue: "Push" })}</p>
            ) : (
              <p className="text-lg font-bold text-red-400">{t("better-luck-next-time", { defaultValue: "Better luck next time" })}</p>
            )}
          </div>
        ) : totalBet > 0 ? (
          <p className="text-sm text-red-400">{t("no-wins-this-round", { defaultValue: "No wins this round" })}</p>
        ) : null}

        <p className="text-xs text-site-text-dim">{t("next-round-starting-soon", { defaultValue: "Next round starting soon..." })}</p>
      </div>
    );
  }

  // Fallback
  return (
    <div className="text-center text-site-text-dim py-4">
      <p className="text-sm animate-pulse">{t("loading", { defaultValue: "Loading..." })}</p>
    </div>
  );
}
