'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlackjackStore } from '@/lib/blackjack/store';
import { formatHandValue } from '@/lib/blackjack/logic';
import type { Card } from '@/lib/blackjack/logic';
import type { PlayerSeatClient } from '@/lib/blackjack/types';
import { CoinIcon } from './CoinIcon';

// ── Card Rendering with Flip Animation ─────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_COLORS: Record<string, string> = { H: 'text-red-600', D: 'text-red-600', C: 'text-gray-900', S: 'text-gray-900' };

const FLIP_DURATION_MS = 500;

/**
 * Returns true only once the most recently dealt card has finished flipping
 * face-up. Used to gate hand totals so the number never appears before the
 * cards have visually settled. `lastCardDelayMs` is the flip delay applied to
 * the newest card (index count - 1).
 */
function useFlipSettled(count: number, lastCardDelayMs: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (count === 0) {
      setSettled(false);
      return;
    }
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), lastCardDelayMs + FLIP_DURATION_MS + 80);
    return () => clearTimeout(timer);
  }, [count, lastCardDelayMs]);
  return settled;
}

/**
 * Local per-turn countdown. Re-syncs to the authoritative `turnTimeout` from
 * the server whenever it changes, and ticks down smoothly between updates.
 */
function useTurnSeconds(active: boolean, turnTimeout: number | null): number | null {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!active || turnTimeout == null) {
      setSecs(null);
      return;
    }
    setSecs(turnTimeout);
    const iv = setInterval(() => setSecs((s) => (s != null && s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [active, turnTimeout]);
  return secs;
}

function CardFace({ card, small, delay }: { card: Card; small?: boolean; delay?: number }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFlipped(true), delay ?? 0);
    return () => clearTimeout(timer);
  }, [delay]);

  const w = small ? 'w-7 h-10 sm:w-8 sm:h-11' : 'w-9 h-13 sm:w-10 sm:h-14';
  const textSize = small ? 'text-[9px] sm:text-[10px]' : 'text-[11px] sm:text-xs';

  return (
    <div className={`${w} perspective-500 shrink-0`}>
      <div
        className={`relative w-full h-full transition-transform duration-500 ease-out transform-3d ${
          flipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Back */}
        <div className="absolute inset-0 backface-hidden rounded-md border border-site-accent/40 bg-linear-to-br from-site-accent to-site-accent-hover" />
        {/* Front */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-md border border-gray-300 flex flex-col items-center justify-center bg-white">
          <span className={`${textSize} font-bold text-black`}>{card.rank}</span>
          <span className={`${textSize} ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
        </div>
      </div>
    </div>
  );
}

function CardBack({ small }: { small?: boolean }) {
  const w = small ? 'w-7 h-10 sm:w-8 sm:h-11' : 'w-9 h-13 sm:w-10 sm:h-14';
  return (
    <div className={`${w} rounded-md border border-site-accent/40 bg-linear-to-br from-site-accent to-site-accent-hover shrink-0`} />
  );
}

function Hand({ cards, hidden }: { cards: Card[]; hidden?: boolean }) {
  return (
    <div className="flex gap-0.5 sm:gap-1">
      {cards.map((card, i) => {
        if (hidden && i === 1) return <CardBack key={i} />;
        return <CardFace key={`${card.rank}${card.suit}${i}`} card={card} delay={i * 200} />;
      })}
    </div>
  );
}

// ── Split Hand ─────────────────────────────────────────────────────

function SplitHandView({ sh, idx, active }: {
  sh: PlayerSeatClient['splitHands'][number];
  idx: number;
  active: boolean;
}) {
  const { t } = useTranslation("c-rmhcoins");
  const settled = useFlipSettled(sh.hand.length, Math.max(0, sh.hand.length - 1) * 300 + 100);

  return (
    <div className={`flex flex-col items-center gap-0.5 ${active ? 'ring-1 ring-site-accent rounded p-0.5' : ''}`}>
      <span className="text-[8px] text-site-text-dim uppercase">{t("hand-n", { defaultValue: "Hand {{n}}", n: idx + 2 })}</span>
      <div className="flex gap-0.5">
        {sh.hand.map((card, i) => (
          <CardFace key={`s${idx}-${card.rank}${card.suit}${i}`} card={card} small delay={i * 300 + 100} />
        ))}
      </div>
      <span className="text-[10px] text-site-text-dim font-mono min-h-3">
        {settled && sh.hand.length > 0 ? formatHandValue(sh.hand) : ''}
      </span>
      {sh.bet > 0 && (
        <div className="flex items-center gap-0.5">
          <CoinIcon className="w-2.5 h-2.5" />
          <span className="text-[9px] text-yellow-500 font-bold">{sh.bet}</span>
        </div>
      )}
      {sh.result && (
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${
          sh.result === 'win' ? 'bg-site-success/25 text-site-success'
          : sh.result === 'blackjack' ? 'bg-site-accent-dim text-site-accent'
          : sh.result === 'push' ? 'bg-blue-500/30 text-blue-400'
          : 'bg-site-danger/25 text-site-danger'
        }`}>
          {sh.result === 'blackjack' ? t("bj-short", { defaultValue: "BJ!" }) : sh.result.toUpperCase()}
        </span>
      )}
      {sh.payout > 0 && <span className="text-[9px] text-site-success font-bold">+{sh.payout}</span>}
    </div>
  );
}

// ── Player Seat ────────────────────────────────────────────────────

function PlayerSeatView({ player, isCurrentTurn, isMe, turnSeconds }: {
  player: PlayerSeatClient;
  isCurrentTurn: boolean;
  isMe: boolean;
  turnSeconds: number | null;
}) {
  const { t } = useTranslation("c-rmhcoins");
  const statusBadge: Record<string, { label: string; color: string }> = {
    waiting: { label: '', color: '' },
    betting: { label: t("status-bet-placed", { defaultValue: "Bet placed" }), color: 'bg-site-accent-dim text-site-accent' },
    playing: { label: t("status-thinking", { defaultValue: "Thinking..." }), color: 'bg-blue-500/20 text-blue-400' },
    standing: { label: t("status-stand", { defaultValue: "Stand" }), color: 'bg-site-surface-active text-site-text-muted' },
    busted: { label: t("status-bust", { defaultValue: "Bust!" }), color: 'bg-site-danger/20 text-site-danger' },
    blackjack: { label: t("bj-short", { defaultValue: "BJ!" }), color: 'bg-site-accent-dim text-site-accent' },
    done: { label: '', color: '' },
  };

  const resultBadge: Record<string, { label: string; color: string }> = {
    win: { label: t("result-win", { defaultValue: "WIN" }), color: 'bg-site-success/25 text-site-success' },
    lose: { label: t("result-lose", { defaultValue: "LOSE" }), color: 'bg-site-danger/25 text-site-danger' },
    push: { label: t("result-push", { defaultValue: "PUSH" }), color: 'bg-blue-500/30 text-blue-400' },
    blackjack: { label: t("result-blackjack", { defaultValue: "BLACKJACK!" }), color: 'bg-site-accent-dim text-site-accent' },
  };

  const badge = player.result ? resultBadge[player.result] : statusBadge[player.status];

  // Gate the running total behind the flip of the most recently dealt card.
  const mainSettled = useFlipSettled(player.hand.length, Math.max(0, player.hand.length - 1) * 300 + 100);

  return (
    <div
      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all min-w-0 shrink-0 ${
        isCurrentTurn ? 'ring-2 ring-site-accent bg-site-accent-dim animate-pulse' : ''
      } ${isMe ? 'bg-site-surface/50' : ''}`}
    >
      {/* Name */}
      <div className="flex items-center gap-1">
        {player.avatarUrl ? (
          <img src={player.avatarUrl} alt="" className="w-4 h-4 rounded-full shrink-0" />
        ) : null}
        <span className={`text-xs font-bold truncate max-w-16 sm:max-w-20 ${isMe ? 'text-site-accent' : 'text-site-text'}`}>
          {isMe ? t("you", { defaultValue: "You" }) : player.userName}
        </span>
        {isCurrentTurn && turnSeconds != null && (
          <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${
            turnSeconds <= 5 ? 'bg-site-danger/30 text-site-danger animate-pulse' : 'bg-site-accent-dim text-site-accent'
          }`}>
            {turnSeconds}s
          </span>
        )}
      </div>

      {/* Main hand */}
      {player.hand.length > 0 ? (
        <div className={`flex flex-col items-center gap-0.5 ${player.hasSplit && player.activeSplitIndex === -1 && isCurrentTurn ? 'ring-1 ring-site-accent rounded p-0.5' : ''}`}>
          {player.hasSplit && <span className="text-[8px] text-site-text-dim uppercase">{t("hand-1", { defaultValue: "Hand 1" })}</span>}
          <div className="flex gap-0.5">
            {player.hand.map((card, i) => (
              <CardFace key={`${card.rank}${card.suit}${i}`} card={card} small delay={i * 300 + 100} />
            ))}
          </div>
          <span className="text-[10px] text-site-text-dim font-mono min-h-3">
            {mainSettled ? formatHandValue(player.hand) : ''}
          </span>
        </div>
      ) : null}

      {/* Split hands */}
      {player.splitHands?.map((sh, idx) => (
        <SplitHandView
          key={idx}
          sh={sh}
          idx={idx}
          active={player.activeSplitIndex === idx && isCurrentTurn}
        />
      ))}

      {/* Bet */}
      {player.bet > 0 && (
        <div className="flex items-center gap-0.5">
          <CoinIcon className="w-3 h-3" />
          <span className="text-[10px] text-yellow-500 font-bold">{player.bet}</span>
        </div>
      )}

      {/* Insurance indicator */}
      {player.insuranceBet > 0 && (
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-blue-400 font-bold">
            INS: {player.insuranceBet}
            {player.insuranceResult === 'won' && ' +' + player.insuranceBet * 2}
            {player.insuranceResult === 'lost' && ' ' + t("insurance-lost", { defaultValue: "lost" })}
          </span>
        </div>
      )}

      {/* Status/Result badge */}
      {badge?.label && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.color}`}>
          {badge.label}
        </span>
      )}

      {/* Payout */}
      {player.result && player.payout > 0 && (
        <span className="text-[10px] text-site-success font-bold animate-bounce">+{player.payout}</span>
      )}
    </div>
  );
}

// ── Table Component ────────────────────────────────────────────────

export function BlackjackTable() {
  const { t } = useTranslation("c-rmhcoins");
  const {
    players,
    dealerHand,
    dealerValue,
    currentTurnUserId,
    myUserId,
    tablePhase,
    turnTimeout,
  } = useBlackjackStore();

  const turnSeconds = useTurnSeconds(!!currentTurnUserId && tablePhase === 'player_turns', turnTimeout);

  const showDealerHidden = tablePhase !== 'dealer_turn' && tablePhase !== 'results' && tablePhase !== 'payout';

  // Gate the dealer total behind the flip of its most recently revealed card.
  const dealerSettled = useFlipSettled(dealerHand.length, Math.max(0, dealerHand.length - 1) * 200);
  // While the hole card is hidden we never show a total (no premature reveal).
  const dealerValueVisible = !showDealerHidden && dealerSettled;

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4">
      {/* Dealer area */}
      <div className={`flex flex-col items-center gap-1 p-2.5 sm:p-3 rounded-xl bg-site-bg-subtle border border-site-border min-h-18 sm:min-h-20 w-full transition-all ${
        tablePhase === 'dealer_turn' ? 'ring-2 ring-site-accent/50' : ''
      }`}>
        <span className="text-[10px] sm:text-xs text-site-text-dim font-bold uppercase tracking-wider">{t("dealer", { defaultValue: "Dealer" })}</span>
        {dealerHand.length > 0 ? (
          <div className="flex flex-col items-center gap-1">
            <Hand cards={dealerHand} hidden={showDealerHidden} />
            {dealerValueVisible && (
              <span className="text-xs text-site-text-dim font-mono">
                {dealerValue !== null ? dealerValue : formatHandValue(dealerHand)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-site-text-dim">{t("waiting-to-deal", { defaultValue: "Waiting to deal..." })}</span>
        )}
      </div>

      {/* Players — wrap onto multiple rows so every seat is shown without a scrollbar */}
      {players.length > 0 ? (
        <div className="w-full">
          <div className="flex flex-wrap justify-center gap-2">
            {players
              .sort((a, b) => a.seatIndex - b.seatIndex)
              .map((player) => (
                <PlayerSeatView
                  key={player.userId}
                  player={player}
                  isCurrentTurn={currentTurnUserId === player.userId}
                  isMe={player.userId === myUserId}
                  turnSeconds={currentTurnUserId === player.userId ? turnSeconds : null}
                />
              ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-site-text-dim">{t("no-players", { defaultValue: "No players at the table yet." })}</p>
      )}
    </div>
  );
}
