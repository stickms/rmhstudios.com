'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import { useHoldemStore } from '@/lib/holdem/store';
import { getHoldemSocket } from '@/lib/holdem/socket';
import { C2S } from '@/lib/holdem/events';

export function HoldemControls() {
  const {
    phase,
    currentTurnUserId,
    myUserId,
    players,
    currentBet,
    minRaise,
    error,
    roomInfo,
  } = useHoldemStore();

  const [raiseAmount, setRaiseAmount] = useState('');

  const myPlayer = players.find((p) => p.userId === myUserId);
  const isMyTurn = currentTurnUserId === myUserId;
  const toCall = (currentBet - (myPlayer?.currentBet ?? 0));
  const canCheck = toCall <= 0;
  const myChips = myPlayer?.totalChips ?? 0;
  const minRaiseTotal = currentBet + minRaise;

  const emit = useCallback((event: string, payload?: unknown) => {
    const sock = getHoldemSocket();
    if (sock) sock.emit(event, payload);
  }, []);

  if (phase === 'waiting') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">Waiting for more players to join...</p>
        {roomInfo && (
          <p className="text-xs mt-1">
            Buy-in: <span className="text-site-text font-bold">{roomInfo.buyIn}</span> coins
            {roomInfo.joinCode && (
              <span className="ml-2">
                Join code: <span className="font-mono font-bold text-emerald-400">{roomInfo.joinCode}</span>
              </span>
            )}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">Hand complete. Next hand starting soon...</p>
      </div>
    );
  }

  if (!isMyTurn || !myPlayer || myPlayer.folded) {
    const currentPlayer = players.find((p) => p.userId === currentTurnUserId);
    return (
      <div className="text-center text-site-text-dim py-4">
        {myPlayer?.folded ? (
          <p className="text-sm">You folded this hand.</p>
        ) : currentPlayer ? (
          <p className="text-sm">
            Waiting for <span className="text-site-text font-bold">{currentPlayer.userName}</span>...
          </p>
        ) : (
          <p className="text-sm animate-pulse">Dealing...</p>
        )}
      </div>
    );
  }

  const handleRaise = () => {
    const amount = parseInt(raiseAmount, 10) || minRaiseTotal;
    emit(C2S.RAISE, { amount });
    setRaiseAmount('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <p className="text-sm text-emerald-500 font-bold animate-pulse">Your turn!</p>
        <p className="text-xs text-site-text-dim">
          Your chips: <span className="font-bold text-site-text">{myChips}</span>
          {toCall > 0 && <span> | To call: <span className="font-bold text-yellow-400">{Math.min(toCall, myChips)}</span></span>}
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => emit(C2S.FOLD)}
          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg">
          Fold
        </Button>

        {canCheck ? (
          <Button onClick={() => emit(C2S.CHECK)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg">
            Check
          </Button>
        ) : (
          <Button onClick={() => emit(C2S.CALL)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg">
            Call {Math.min(toCall, myChips)}
          </Button>
        )}

        <Button onClick={() => emit(C2S.ALL_IN)}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg">
          All In
        </Button>
      </div>

      {/* Raise controls */}
      {myChips > toCall && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type="number" min={minRaiseTotal} max={myChips + (myPlayer?.currentBet ?? 0)}
              placeholder={`Min ${minRaiseTotal}`}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(e.target.value)}
              className="w-full bg-site-surface border border-site-border rounded-lg px-3 py-2 text-site-text text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
            <CoinIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
          </div>
          <Button onClick={handleRaise}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg">
            Raise
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
    </div>
  );
}
