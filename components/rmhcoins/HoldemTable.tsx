'use client';

import { useState, useEffect } from 'react';
import { useHoldemStore } from '@/lib/holdem/store';
import { HAND_RANK_LABELS } from '@/lib/holdem/logic';
import type { Card } from '@/lib/holdem/logic';
import type { PlayerSeatClient } from '@/lib/holdem/types';
import { CoinIcon } from './CoinIcon';

const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_COLORS: Record<string, string> = { H: 'text-red-500', D: 'text-red-500', C: 'text-white', S: 'text-white' };

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
      <div className={`relative w-full h-full transition-transform duration-700 ease-out transform-3d ${flipped ? 'rotate-y-180' : ''}`}>
        <div className="absolute inset-0 backface-hidden rounded-md border border-blue-500/30 bg-linear-to-br from-blue-800 to-blue-950" />
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
    <div className={`${w} rounded-md border border-blue-500/30 bg-linear-to-br from-blue-800 to-blue-950 shrink-0`} />
  );
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

function PlayerSeatView({ player, isCurrentTurn, isMe, turnSeconds }: {
  player: PlayerSeatClient;
  isCurrentTurn: boolean;
  isMe: boolean;
  turnSeconds: number | null;
}) {
  const actionLabels: Record<string, { label: string; color: string }> = {
    fold: { label: 'Fold', color: 'text-gray-500' },
    check: { label: 'Check', color: 'text-blue-400' },
    call: { label: 'Call', color: 'text-emerald-400' },
    raise: { label: 'Raise', color: 'text-yellow-400' },
    all_in: { label: 'ALL IN', color: 'text-red-400' },
  };

  return (
    <div className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all shrink-0 min-w-0 ${
      isCurrentTurn ? 'ring-2 ring-emerald-500 bg-emerald-500/5 animate-pulse' : ''
    } ${player.folded || player.sittingOut ? 'opacity-40' : ''} ${isMe ? 'bg-site-surface/50' : ''}`}>
      {/* Name + position badges */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {player.avatarUrl && <img src={player.avatarUrl} alt="" className="w-4 h-4 rounded-full shrink-0" />}
        <span className={`text-xs font-bold truncate max-w-14 sm:max-w-20 ${isMe ? 'text-emerald-400' : 'text-site-text'}`}>
          {isMe ? 'You' : player.userName}
        </span>
        {player.isDealer && <span className="text-[8px] sm:text-[9px] font-bold bg-yellow-500/30 text-yellow-400 px-1 rounded">D</span>}
        {player.isSmallBlind && <span className="text-[8px] sm:text-[9px] font-bold bg-blue-500/30 text-blue-400 px-1 rounded">SB</span>}
        {player.isBigBlind && <span className="text-[8px] sm:text-[9px] font-bold bg-purple-500/30 text-purple-400 px-1 rounded">BB</span>}
        {isCurrentTurn && turnSeconds != null && (
          <span className={`text-[8px] sm:text-[9px] font-bold tabular-nums px-1 rounded ${
            turnSeconds <= 5 ? 'bg-red-500/30 text-red-400 animate-pulse' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {turnSeconds}s
          </span>
        )}
      </div>

      {/* Hole cards */}
      <div className="flex gap-0.5">
        {player.holeCards ? (
          player.holeCards.map((card, i) =>
            card ? (
              <CardFace key={`${card.rank}${card.suit}${i}`} card={card} small delay={i * 400} />
            ) : (
              <CardBack key={`hidden-${i}`} small />
            )
          )
        ) : !player.folded && !player.sittingOut ? (
          <>
            <CardBack small />
            <CardBack small />
          </>
        ) : null}
      </div>

      {/* Chips */}
      <div className="flex items-center gap-0.5">
        <CoinIcon className="w-3 h-3" />
        <span className="text-[10px] text-site-text font-bold">{player.totalChips}</span>
      </div>

      {/* Current bet */}
      {player.currentBet > 0 && (
        <span className="text-[10px] text-yellow-500 font-bold">Bet: {player.currentBet}</span>
      )}

      {/* Last action */}
      {player.lastAction && !player.folded && (
        <span className={`text-[10px] font-bold ${actionLabels[player.lastAction]?.color ?? ''}`}>
          {actionLabels[player.lastAction]?.label}
        </span>
      )}

      {player.sittingOut && <span className="text-[10px] text-orange-400 font-bold">Sitting Out</span>}
      {player.folded && !player.sittingOut && <span className="text-[10px] text-gray-500 font-bold">Folded</span>}
      {player.allIn && <span className="text-[10px] text-red-400 font-bold animate-pulse">ALL IN</span>}
    </div>
  );
}

export function HoldemTable() {
  const {
    players,
    communityCards,
    pot,
    currentTurnUserId,
    myUserId,
    phase,
    lastHandResults,
    turnTimeout,
  } = useHoldemStore();

  const turnSeconds = useTurnSeconds(
    !!currentTurnUserId && phase !== 'results' && phase !== 'showdown' && phase !== 'waiting',
    turnTimeout
  );

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4">
      {/* Pot */}
      {pot > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-900/40 border border-emerald-700/30">
          <CoinIcon className="w-4 h-4" />
          <span className="text-sm font-bold text-emerald-400">{pot}</span>
        </div>
      )}

      {/* Community cards — responsive sizing */}
      <div className={`flex items-center gap-1 sm:gap-1.5 p-2.5 sm:p-3 rounded-xl bg-emerald-900/30 border border-emerald-700/20 min-h-18 sm:min-h-20`}>
        {communityCards.length > 0 ? (
          communityCards.map((card, i) => (
            <CardFace key={`${card.rank}${card.suit}${i}`} card={card} delay={i * 500} />
          ))
        ) : (
          <span className="text-xs text-site-text-dim px-4">
            {phase === 'waiting' ? 'Waiting for players...' : 'Cards will appear here'}
          </span>
        )}
      </div>

      {/* Hand results */}
      {phase === 'results' && lastHandResults && (
        <div className="flex flex-col gap-1 text-center">
          {lastHandResults.map((r) => {
            const player = players.find((p) => p.userId === r.userId);
            const name = player?.userId === myUserId ? 'You' : player?.userName;
            const net = r.netGain ?? 0;
            if (net === 0 && !r.payout) return null;
            return (
              <div key={r.userId} className="text-xs">
                <span className={`font-bold ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-site-text'}`}>
                  {name}
                </span>
                {net > 0 ? (
                  <span className="font-bold text-emerald-400"> +{net}</span>
                ) : net < 0 ? (
                  <span className="font-bold text-red-400"> {net}</span>
                ) : (
                  <span className="text-site-text-dim"> broke even</span>
                )}
                {r.handRank && (
                  <span className="text-site-text-dim"> — {HAND_RANK_LABELS[r.handRank]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Players — scrollable horizontally on mobile */}
      {players.length > 0 ? (
        <div className="w-full overflow-x-auto -mx-1 px-1">
          <div className="flex justify-center gap-2 min-w-0">
            {[...players]
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
        <p className="text-sm text-site-text-dim">No players at the table yet.</p>
      )}
    </div>
  );
}
