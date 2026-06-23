'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
    insuranceOffered,
    insuranceTimeout,
    error,
  } = useBlackjackStore();

  const [betInput, setBetInput] = useState('5');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [insCountdown, setInsCountdown] = useState<number | null>(null);

  const { t } = useTranslation("c-rmhcoins");

  const myPlayer = players.find((p) => p.userId === myUserId);
  const isMyTurn = currentTurnUserId === myUserId;
  const hasBet = myPlayer?.status === 'betting';
  const canDoubleDown = isMyTurn && myPlayer?.hand.length === 2 && coins >= (myPlayer?.bet ?? 0);

  // Can split: 2 cards of same rank (10/J/Q/K all count as same), haven't split yet, can afford it
  const rankVal = (r: string) => (['10', 'J', 'Q', 'K'].includes(r) ? '10' : r);
  const canSplit = isMyTurn && myPlayer?.hand.length === 2
    && !myPlayer?.hasSplit
    && myPlayer?.hand[0] && myPlayer?.hand[1]
    && rankVal(myPlayer.hand[0].rank) === rankVal(myPlayer.hand[1].rank)
    && coins >= (myPlayer?.bet ?? 0);

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

  // Insurance countdown timer
  useEffect(() => {
    if (tablePhase === 'insurance' && insuranceTimeout !== null) {
      setInsCountdown(insuranceTimeout);
      const interval = setInterval(() => {
        setInsCountdown((prev) => {
          if (prev === null || prev <= 0) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setInsCountdown(null);
    }
  }, [tablePhase, insuranceTimeout]);

  const emit = useCallback((event: string, payload?: unknown) => {
    const sock = getBlackjackSocket();
    if (sock) sock.emit(event, payload);
  }, []);

  const handlePlaceBet = () => {
    const amount = Math.max(1, Math.min(parseInt(betInput, 10) || 1, coins));
    emit(C2S.PLACE_BET, { amount });
  };

  const setQuickBet = (amount: number) => {
    const val = Math.min(amount, coins);
    setBetInput(String(val));
  };

  // Idle state
  if (tablePhase === 'idle') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">{t("waiting-next-round", { defaultValue: "Waiting for the next round to start..." })}</p>
      </div>
    );
  }

  // Betting phase
  if (tablePhase === 'betting') {
    const isLow = countdown !== null && countdown <= 5;

    return (
      <div className="flex flex-col gap-3">
        {countdown !== null && (
          <div className="text-center">
            <span className="text-sm text-site-text-dim">{t("betting-closes-in", { defaultValue: "Betting closes in " })}</span>
            <span className={`font-bold text-lg tabular-nums ${isLow ? 'text-yellow-500 animate-pulse' : 'text-yellow-400'}`}>
              {countdown}s
            </span>
          </div>
        )}

        {hasBet ? (
          <div className="text-center py-2">
            <p className="text-sm text-emerald-400 font-bold">
              {t("bet-placed", { defaultValue: "Bet placed: {{coins}} coins", coins: myPlayer?.bet })}
            </p>
            <p className="text-xs text-site-text-dim mt-1">{t("waiting-other-players", { defaultValue: "Waiting for other players..." })}</p>
          </div>
        ) : (
          <>
            {/* Bet input + quick amounts — stacked on mobile */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={coins}
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  className="w-full bg-site-surface border border-site-border rounded-xl px-3 py-2.5 text-site-text text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                />
                <CoinIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 25, 100, 500].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setQuickBet(amt)}
                    className="min-h-10 text-xs font-bold bg-site-surface border border-site-border rounded-xl text-site-text-dim hover:text-site-text hover:bg-site-surface-hover active:scale-95 transition-all"
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handlePlaceBet}
              disabled={coins < 1}
              className="w-full min-h-11 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-xl"
            >
              {t("place-bet", { defaultValue: "Place Bet" })}
            </Button>
          </>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    );
  }

  // Insurance phase
  if (tablePhase === 'insurance') {
    const insuranceCost = Math.floor((myPlayer?.bet ?? 0) / 2);
    const alreadyDecided = myPlayer?.insuranceBet !== undefined && myPlayer.insuranceBet > 0;
    const canAffordInsurance = coins >= insuranceCost;
    const isInRound = myPlayer && myPlayer.status !== 'waiting' && myPlayer.bet > 0;
    const hasBJ = myPlayer?.status === 'blackjack';

    if (!isInRound || hasBJ) {
      return (
        <div className="text-center text-site-text-dim py-4">
          <p className="text-sm">{t("dealer-ace-insurance-others", { defaultValue: "Dealer showing Ace — Insurance offered to other players..." })}</p>
          {insCountdown !== null && (
            <span className="text-xs text-yellow-500">{insCountdown}s</span>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="text-center">
          <p className="text-sm font-bold text-yellow-500">{t("insurance-question", { defaultValue: "Insurance?" })}</p>
          <p className="text-xs text-site-text-dim mt-1">
            {t("insurance-description", { defaultValue: "Dealer showing Ace. Insurance costs {{cost}} coins (half your bet). Pays 2:1 if dealer has blackjack.", cost: insuranceCost })}
          </p>
          {insCountdown !== null && (
            <span className="text-xs text-site-text-dim mt-1 block">{t("seconds-remaining", { defaultValue: "{{count}}s remaining", count: insCountdown })}</span>
          )}
        </div>

        {alreadyDecided ? (
          <p className="text-sm text-emerald-400 text-center font-bold">{t("insurance-taken", { defaultValue: "Insurance taken!" })}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => emit(C2S.TAKE_INSURANCE)}
              disabled={!canAffordInsurance}
              className="min-h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl"
            >
              {t("take-insurance", { defaultValue: "Take ({{cost}})", cost: insuranceCost })}
            </Button>
            <Button
              onClick={() => emit(C2S.DECLINE_INSURANCE)}
              className="min-h-11 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl"
            >
              {t("no-thanks", { defaultValue: "No Thanks" })}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      </div>
    );
  }

  // Player turns — my turn — grid layout for action buttons
  if (tablePhase === 'player_turns' && isMyTurn) {
    const actionCount = 2 + (canDoubleDown ? 1 : 0) + (canSplit ? 1 : 0);
    const gridCols = actionCount <= 2 ? 'grid-cols-2' : actionCount === 3 ? 'grid-cols-3' : 'grid-cols-2';

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-center text-yellow-500 font-bold animate-pulse">{t("your-turn", { defaultValue: "Your turn!" })}</p>
        <div className={`grid ${gridCols} gap-2`}>
          <Button
            onClick={() => emit(C2S.HIT)}
            className="min-h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
          >
            {t("hit", { defaultValue: "Hit" })}
          </Button>
          <Button
            onClick={() => emit(C2S.STAND)}
            className="min-h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm"
          >
            {t("stand", { defaultValue: "Stand" })}
          </Button>
          {canDoubleDown && (
            <Button
              onClick={() => emit(C2S.DOUBLE_DOWN)}
              className="min-h-12 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm"
            >
              {t("double", { defaultValue: "Double" })}
            </Button>
          )}
          {canSplit && (
            <Button
              onClick={() => emit(C2S.SPLIT)}
              className="min-h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm"
            >
              {t("split", { defaultValue: "Split" })}
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      </div>
    );
  }

  // Player turns — waiting
  if (tablePhase === 'player_turns') {
    const currentPlayer = players.find((p) => p.userId === currentTurnUserId);
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm">
          {t("waiting-for-player", { defaultValue: "Waiting for {{name}}...", name: currentPlayer?.userName ?? 'player' })}
        </p>
      </div>
    );
  }

  // Dealer turn
  if (tablePhase === 'dealer_turn') {
    return (
      <div className="text-center text-site-text-dim py-4">
        <p className="text-sm animate-pulse">{t("dealer-drawing", { defaultValue: "Dealer is drawing..." })}</p>
      </div>
    );
  }

  // Results
  if (tablePhase === 'results') {
    const myResult = players.find((p) => p.userId === myUserId);
    if (!myResult || myResult.result === null) {
      return (
        <div className="text-center text-site-text-dim py-4">
          <p className="text-sm">{t("round-complete", { defaultValue: "Round complete. Next round starting soon..." })}</p>
        </div>
      );
    }

    const resultText: Record<string, { label: string; color: string }> = {
      blackjack: { label: t("result-blackjack", { defaultValue: "Blackjack! (3:2)" }), color: 'text-yellow-400' },
      win: { label: t("result-win", { defaultValue: "You win!" }), color: 'text-emerald-400' },
      push: { label: t("result-push", { defaultValue: "Push" }), color: 'text-blue-400' },
      lose: { label: t("result-lose", { defaultValue: "You lose" }), color: 'text-red-400' },
    };

    const r = resultText[myResult.result] ?? { label: '', color: '' };

    return (
      <div className="text-center py-4">
        <p className={`text-lg font-bold ${r.color}`}>{r.label}</p>
        {myResult.payout > 0 && (
          <p className="text-sm text-site-text-dim mt-1">
            {t("payout-coins", { defaultValue: "+{{payout}} coins", payout: myResult.payout })}
          </p>
        )}
        {myResult.insuranceBet > 0 && myResult.insuranceResult && (
          <p className={`text-xs mt-1 ${myResult.insuranceResult === 'won' ? 'text-blue-400' : 'text-site-text-dim'}`}>
            {myResult.insuranceResult === 'won' ? t("insurance-paid-out", { defaultValue: "Insurance paid out!" }) : t("insurance-lost", { defaultValue: "Insurance lost" })}
          </p>
        )}
        <p className="text-xs text-site-text-dim mt-2">{t("next-round-soon", { defaultValue: "Next round starting soon..." })}</p>
      </div>
    );
  }

  // Dealing / payout / other
  return (
    <div className="text-center text-site-text-dim py-4">
      <p className="text-sm animate-pulse">{t("dealing", { defaultValue: "Dealing..." })}</p>
    </div>
  );
}
