'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import { useBlackjackStore } from '@/lib/blackjack/store';
import { getBlackjackSocket } from '@/lib/blackjack/socket';
import { C2S } from '@/lib/blackjack/events';

interface Props {
  coins: number;
}

export function BlackjackControls({ coins }: Props) {
  const {
    tablePhase,
    currentTurnUserId,
    myUserId,
    players,
    bettingCountdown,
    error,
  } = useBlackjackStore();

  const [betInput, setBetInput] = useState('5');
  const [countdown, setCountdown] = useState<number | null>(null);

  const myPlayer = players.find((p) => p.userId === myUserId);
  const isMyTurn = currentTurnUserId === myUserId;
  const hasBet = myPlayer?.status === 'betting';
  const canDoubleDown = isMyTurn && myPlayer?.hand.length === 2 && coins >= (myPlayer?.bet ?? 0);

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

  const emit = useCallback((event: string, payload?: unknown) => {
    const sock = getBlackjackSocket();
    if (sock) sock.emit(event, payload);
  }, []);

  const handlePlaceBet = () => {
    const amount = Math.max(1, Math.min(parseInt(betInput, 10) || 1, Math.min(coins, 100)));
    emit(C2S.PLACE_BET, { amount });
  };

  const setQuickBet = (amount: number) => {
    const val = Math.min(amount, coins, 100);
    setBetInput(String(val));
  };

  // Idle state
  if (tablePhase === 'idle') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">Waiting for the next round to start...</p>
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
            <span className="font-bold text-yellow-500">{countdown}s</span>
          </div>
        )}

        {hasBet ? (
          <div className="text-center py-2">
            <p className="text-sm text-emerald-400 font-bold">
              Bet placed: {myPlayer?.bet} coins
            </p>
            <p className="text-xs text-site-text-dim mt-1">Waiting for other players...</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={1}
                  max={Math.min(coins, 100)}
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  className="w-full bg-site-surface border border-site-border rounded-lg px-3 py-2 text-site-text text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                />
                <CoinIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
              </div>
              <div className="flex gap-1.5">
                {[1, 5, 10, 25].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setQuickBet(amt)}
                    className="flex-1 sm:flex-none px-3 py-2 text-xs font-bold bg-site-surface border border-site-border rounded-lg text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handlePlaceBet}
              disabled={coins < 1}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg"
            >
              Place Bet
            </Button>
          </>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    );
  }

  // Player turns — my turn
  if (tablePhase === 'player_turns' && isMyTurn) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-center text-yellow-500 font-bold">Your turn!</p>
        <div className="flex gap-2">
          <Button
            onClick={() => emit(C2S.HIT)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
          >
            Hit
          </Button>
          <Button
            onClick={() => emit(C2S.STAND)}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg"
          >
            Stand
          </Button>
          {canDoubleDown && (
            <Button
              onClick={() => emit(C2S.DOUBLE_DOWN)}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg"
            >
              Double
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      </div>
    );
  }

  // Player turns — waiting for another player
  if (tablePhase === 'player_turns') {
    const currentPlayer = players.find((p) => p.userId === currentTurnUserId);
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">
          Waiting for <span className="text-site-text font-bold">{currentPlayer?.userName ?? 'player'}</span>...
        </p>
      </div>
    );
  }

  // Dealer turn
  if (tablePhase === 'dealer_turn') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">Dealer is drawing...</p>
      </div>
    );
  }

  // Results
  if (tablePhase === 'results') {
    const myResult = players.find((p) => p.userId === myUserId);
    if (!myResult || myResult.result === null) {
      return (
        <div className="text-center text-site-text-dim py-4">
          <p className="text-sm">Round complete. Next round starting soon...</p>
        </div>
      );
    }

    const resultText: Record<string, { label: string; color: string }> = {
      blackjack: { label: 'Blackjack!', color: 'text-yellow-400' },
      win: { label: 'You win!', color: 'text-emerald-400' },
      push: { label: 'Push', color: 'text-blue-400' },
      lose: { label: 'You lose', color: 'text-red-400' },
    };

    const r = resultText[myResult.result] ?? { label: '', color: '' };

    return (
      <div className="text-center py-4">
        <p className={`text-lg font-bold ${r.color}`}>{r.label}</p>
        {myResult.payout > 0 && (
          <p className="text-sm text-site-text-dim mt-1">
            +{myResult.payout} coins
          </p>
        )}
        <p className="text-xs text-site-text-dim mt-2">Next round starting soon...</p>
      </div>
    );
  }

  // Dealing / payout / other states
  return (
    <div className="text-center text-site-text-dim py-4">
      <p className="text-sm">Dealing...</p>
    </div>
  );
}
