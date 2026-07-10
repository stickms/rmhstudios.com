'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import { useHoldemStore } from '@/lib/holdem/store';
import { getHoldemSocket } from '@/lib/holdem/socket';
import { C2S } from '@/lib/holdem/events';
import { evaluateBestHand, HAND_RANK_LABELS } from '@/lib/holdem/logic';
import type { Card } from '@/lib/holdem/logic';

function MyHandRank({ holeCards, communityCards }: { holeCards: (Card | null)[] | null; communityCards: Card[] }) {
  const { t } = useTranslation("c-rmhcoins");
  const handLabel = useMemo(() => {
    if (!holeCards || holeCards.length < 2 || communityCards.length < 3) return null;
    const validCards = holeCards.filter((c): c is Card => c !== null);
    if (validCards.length < 2) return null;
    const allCards = [...validCards, ...communityCards];
    const result = evaluateBestHand(allCards);
    return HAND_RANK_LABELS[result.rank];
  }, [holeCards, communityCards]);

  if (!handLabel) return null;
  return <span className="text-xs text-site-text-dim">{t("your-hand", { defaultValue: "Your hand:" })} <span className="font-bold text-site-text">{handLabel}</span></span>;
}

export function HoldemControls() {
  const {
    phase,
    currentTurnUserId,
    myUserId,
    players,
    communityCards,
    currentBet,
    minRaise,
    pot,
    resultsCountdown,
    error,
    roomInfo,
  } = useHoldemStore();

  const { t } = useTranslation("c-rmhcoins");
  const [raiseAmount, setRaiseAmount] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showingCards, setShowingCards] = useState<boolean[]>([false, false]);

  // Local countdown timer that ticks every second
  useEffect(() => {
    if (resultsCountdown != null && resultsCountdown > 0) {
      setCountdown(resultsCountdown);
      const interval = setInterval(() => {
        setCountdown((prev) => (prev != null && prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
    setCountdown(null);
  }, [resultsCountdown]);

  // Reset showingCards state when phase changes away from results
  useEffect(() => {
    if (phase !== 'results') setShowingCards([false, false]);
  }, [phase]);

  const myPlayer = players.find((p) => p.userId === myUserId);
  const isMyTurn = currentTurnUserId === myUserId;
  const toCall = (currentBet - (myPlayer?.currentBet ?? 0));
  const canCheck = toCall <= 0;
  const myChips = myPlayer?.totalChips ?? 0;
  const minRaiseTotal = currentBet + minRaise;
  const isSittingOut = myPlayer?.sittingOut ?? true;

  const emit = useCallback((event: string, payload?: unknown) => {
    const sock = getHoldemSocket();
    if (sock) sock.emit(event, payload);
  }, []);

  const isBusted = myPlayer && myChips === 0 && isSittingOut;

  // Rebuy button for busted players
  const rebuyButton = isBusted ? (
    <Button onClick={() => emit(C2S.REBUY)}
      className="min-h-11 bg-site-accent hover:bg-site-accent-hover text-site-accent-fg font-bold rounded-xl text-sm">
      {t("rebuy-coins", { defaultValue: "Rebuy ({{count}} coins)", count: roomInfo?.buyIn ?? 0 })}
    </Button>
  ) : null;

  // Sit in/out button shown when sitting out or during waiting/results
  const sitButton = myPlayer && isSittingOut && !isBusted ? (
    <Button onClick={() => emit(C2S.SIT_IN)}
      className="min-h-11 bg-site-accent hover:bg-site-accent-hover text-site-accent-fg font-bold rounded-xl text-sm">
      {t("sit-in", { defaultValue: "Sit In" })}
    </Button>
  ) : myPlayer && !isSittingOut && (phase === 'waiting' || phase === 'results') ? (
    <Button onClick={() => emit(C2S.SIT_OUT)} variant="outline"
      className="min-h-10 rounded-xl text-sm">
      {t("sit-out", { defaultValue: "Sit Out" })}
    </Button>
  ) : null;

  if (phase === 'waiting') {
    return (
      <div className="text-center text-site-text-dim py-4 flex flex-col items-center gap-2">
        {isBusted ? (
          <>
            <p className="text-sm font-semibold text-red-400">{t("out-of-chips", { defaultValue: "You're out of chips!" })}</p>
            <p className="text-xs">{t("buy-back-in-for", { defaultValue: "Buy back in for" })} <span className="font-bold text-site-text">{roomInfo?.buyIn ?? 0}</span> {t("coins", { defaultValue: "coins" })}.</p>
          </>
        ) : isSittingOut ? (
          <p className="text-sm">{t("sit-in-to-play", { defaultValue: "Sit in to start playing!" })}</p>
        ) : (
          <p className="text-sm">{t("waiting-for-players", { defaultValue: "Waiting for more players to sit in..." })}</p>
        )}
        {isBusted ? rebuyButton : sitButton}
        {roomInfo && (
          <p className="text-xs mt-1">
            {t("buy-in-label", { defaultValue: "Buy-in:" })} <span className="text-site-text font-bold">{roomInfo.buyIn}</span> {t("coins", { defaultValue: "coins" })}
            {roomInfo.joinCode && (
              <span className="ml-2">
                {t("code-label", { defaultValue: "Code:" })} <span className="font-mono font-bold text-site-accent">{roomInfo.joinCode}</span>
              </span>
            )}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'results') {
    const hasCards = myPlayer && myPlayer.holeCards && myPlayer.holeCards.length === 2;

    const toggleCard = (index: number) => {
      const next = [...showingCards];
      next[index] = !next[index];
      setShowingCards(next);
      const indices = next.map((v, i) => v ? i : -1).filter((i) => i >= 0);
      emit(C2S.SHOW_CARDS, { indices });
    };

    const toggleBoth = () => {
      const allShown = showingCards[0] && showingCards[1];
      const next = [!allShown, !allShown];
      setShowingCards(next);
      emit(C2S.SHOW_CARDS, { indices: allShown ? [] : [0, 1] });
    };

    return (
      <div className="text-center text-site-text-dim py-4 flex flex-col items-center gap-2">
        {countdown != null && countdown > 0 && (
          <p className="text-xs font-mono text-site-text-dim">{t("next-hand-in", { defaultValue: "Next hand in" })} <span className="font-bold text-site-text">{countdown}s</span></p>
        )}
        {isBusted ? (
          <>
            <p className="text-sm font-semibold text-red-400">{t("out-of-chips", { defaultValue: "You're out of chips!" })}</p>
            <p className="text-xs">{t("buy-back-in-for", { defaultValue: "Buy back in for" })} <span className="font-bold text-site-text">{roomInfo?.buyIn ?? 0}</span> {t("coins-to-keep-playing", { defaultValue: "coins to keep playing" })}.</p>
            {rebuyButton}
          </>
        ) : (
          <>
            {hasCards && !isSittingOut && !myPlayer.folded && (
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-xs text-site-text-dim">{t("show-your-cards", { defaultValue: "Show your cards?" })}</p>
                <div className="flex gap-2">
                  <button onClick={() => toggleCard(0)}
                    className={`min-h-10 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors active:scale-95 ${showingCards[0] ? 'bg-site-accent border-site-accent text-site-accent-fg' : 'bg-site-surface border-site-border text-site-text-dim hover:border-site-accent'}`}>
                    {t("card-1", { defaultValue: "Card 1" })}
                  </button>
                  <button onClick={() => toggleCard(1)}
                    className={`min-h-10 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors active:scale-95 ${showingCards[1] ? 'bg-site-accent border-site-accent text-site-accent-fg' : 'bg-site-surface border-site-border text-site-text-dim hover:border-site-accent'}`}>
                    {t("card-2", { defaultValue: "Card 2" })}
                  </button>
                  <button onClick={toggleBoth}
                    className={`min-h-10 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors active:scale-95 ${showingCards[0] && showingCards[1] ? 'bg-site-accent border-site-accent text-site-accent-fg' : 'bg-site-surface border-site-border text-site-text-dim hover:border-site-accent'}`}>
                    {t("both", { defaultValue: "Both" })}
                  </button>
                </div>
              </div>
            )}
            {sitButton}
          </>
        )}
      </div>
    );
  }

  if (isSittingOut) {
    return (
      <div className="text-center text-site-text-dim py-4 flex flex-col items-center gap-2">
        {isBusted ? (
          <>
            <p className="text-sm font-semibold text-red-400">{t("out-of-chips", { defaultValue: "You're out of chips!" })}</p>
            <p className="text-xs">{t("buy-back-in-for", { defaultValue: "Buy back in for" })} <span className="font-bold text-site-text">{roomInfo?.buyIn ?? 0}</span> {t("coins-to-keep-playing", { defaultValue: "coins to keep playing" })}.</p>
            {rebuyButton}
          </>
        ) : (
          <>
            <p className="text-sm">{t("you-are-sitting-out", { defaultValue: "You are sitting out." })}</p>
            {sitButton}
          </>
        )}
      </div>
    );
  }

  if (!isMyTurn || !myPlayer || myPlayer.folded) {
    const currentPlayer = players.find((p) => p.userId === currentTurnUserId);
    return (
      <div className="text-center text-site-text-dim py-4 flex flex-col items-center gap-1">
        {myPlayer?.folded ? (
          <p className="text-sm">{t("you-folded", { defaultValue: "You folded this hand." })}</p>
        ) : currentPlayer ? (
          <p className="text-sm">
            {t("waiting-for-player", { defaultValue: "Waiting for" })} <span className="text-site-text font-bold">{currentPlayer.userName}</span>...
          </p>
        ) : (
          <p className="text-sm animate-pulse">{t("dealing", { defaultValue: "Dealing..." })}</p>
        )}
        <MyHandRank holeCards={myPlayer?.holeCards ?? null} communityCards={communityCards} />
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
        <p className="text-sm text-site-accent font-bold animate-pulse">{t("your-turn", { defaultValue: "Your turn!" })}</p>
        <p className="text-xs text-site-text-dim">
          {t("your-chips", { defaultValue: "Your chips:" })} <span className="font-bold text-site-text">{myChips}</span>
          {toCall > 0 && <span> | {t("to-call", { defaultValue: "To call:" })} <span className="font-bold text-yellow-400">{Math.min(toCall, myChips)}</span></span>}
        </p>
      </div>

      {/* Action buttons — grid for consistent sizing */}
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => emit(C2S.FOLD)}
          className="min-h-12 bg-site-surface-active hover:bg-site-surface-hover text-site-text border border-site-border font-bold rounded-xl text-sm">
          {t("fold", { defaultValue: "Fold" })}
        </Button>

        {canCheck ? (
          <Button onClick={() => emit(C2S.CHECK)}
            className="min-h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm">
            {t("check", { defaultValue: "Check" })}
          </Button>
        ) : (
          <Button onClick={() => emit(C2S.CALL)}
            className="min-h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm">
            {t("call", { defaultValue: "Call" })} {Math.min(toCall, myChips)}
          </Button>
        )}

        <Button onClick={() => emit(C2S.ALL_IN)}
          className="min-h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm">
          {t("all-in", { defaultValue: "All In" })}
        </Button>
      </div>

      {/* Raise controls */}
      {myChips > toCall && (
        <div className="flex flex-col gap-2">
          {/* Quick-bet presets — scrollable on mobile */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: '\u00BC Pot', value: Math.floor(pot * 0.25) },
              { label: '\u00BD Pot', value: Math.floor(pot * 0.5) },
              { label: '\u00BE Pot', value: Math.floor(pot * 0.75) },
              { label: 'Pot', value: pot },
              { label: '2\u00D7', value: Math.floor(pot * 2) },
            ]
              .filter((p) => p.value >= minRaiseTotal && p.value < myChips + (myPlayer?.currentBet ?? 0))
              .map((p) => (
                <button key={p.label} onClick={() => setRaiseAmount(String(p.value))}
                  className="min-h-9 px-2.5 py-1 text-xs font-semibold rounded-xl bg-site-surface border border-site-border hover:border-site-accent hover:text-site-accent text-site-text-dim transition-colors active:scale-95">
                  {p.label}
                </button>
              ))}
            <button onClick={() => setRaiseAmount(String(minRaiseTotal))}
              className="min-h-9 px-2.5 py-1 text-xs font-semibold rounded-xl bg-site-surface border border-site-border hover:border-site-accent hover:text-site-accent text-site-text-dim transition-colors active:scale-95">
              Min
            </button>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type="number" min={minRaiseTotal} max={myChips + (myPlayer?.currentBet ?? 0)}
                placeholder={t("min-raise-placeholder", { defaultValue: "Min {{min}}", min: minRaiseTotal })}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(e.target.value)}
                className="w-full bg-site-surface border border-site-border rounded-xl px-3 py-2.5 text-site-text text-sm focus:outline-none focus:ring-2 focus:ring-site-accent/40" />
              <CoinIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
            </div>
            <Button onClick={handleRaise} variant="accent"
              className="min-h-11 font-bold rounded-xl">
              {t("raise", { defaultValue: "Raise" })}
            </Button>
          </div>
        </div>
      )}

      <MyHandRank holeCards={myPlayer?.holeCards ?? null} communityCards={communityCards} />

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
    </div>
  );
}
