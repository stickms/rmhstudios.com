'use client';

import { useBlackjackStore } from '@/lib/blackjack/store';
import { formatHandValue } from '@/lib/blackjack/logic';
import type { Card } from '@/lib/blackjack/logic';
import type { PlayerSeatClient } from '@/lib/blackjack/types';
import { CoinIcon } from './CoinIcon';

// ── Card Rendering ─────────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_COLORS: Record<string, string> = { H: 'text-red-500', D: 'text-red-500', C: 'text-white', S: 'text-white' };

function CardFace({ card, small }: { card: Card; small?: boolean }) {
  const isHidden = card.rank === '2' && card.suit === 'S' && !card.rank; // placeholder detection
  const w = small ? 'w-8 h-11' : 'w-10 h-14';
  const textSize = small ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`${w} rounded-md border border-white/20 flex flex-col items-center justify-center bg-white/10 backdrop-blur-sm shrink-0`}>
      <span className={`${textSize} font-bold text-white`}>{card.rank}</span>
      <span className={`${textSize} ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}

function CardBack({ small }: { small?: boolean }) {
  const w = small ? 'w-8 h-11' : 'w-10 h-14';
  return (
    <div className={`${w} rounded-md border border-blue-500/30 bg-gradient-to-br from-blue-800 to-blue-950 flex items-center justify-center shrink-0`}>
      <div className="w-5 h-7 rounded-sm border border-blue-400/30 bg-blue-700/50" />
    </div>
  );
}

function Hand({ cards, hidden }: { cards: Card[]; hidden?: boolean }) {
  return (
    <div className="flex gap-1">
      {cards.map((card, i) => {
        if (hidden && i === 1) return <CardBack key={i} />;
        return <CardFace key={i} card={card} />;
      })}
    </div>
  );
}

// ── Player Seat ────────────────────────────────────────────────────

function PlayerSeatView({ player, isCurrentTurn, isMe }: {
  player: PlayerSeatClient;
  isCurrentTurn: boolean;
  isMe: boolean;
}) {
  const statusBadge: Record<string, { label: string; color: string }> = {
    waiting: { label: '', color: '' },
    betting: { label: 'Bet placed', color: 'bg-yellow-500/20 text-yellow-400' },
    playing: { label: 'Thinking...', color: 'bg-blue-500/20 text-blue-400' },
    standing: { label: 'Stand', color: 'bg-gray-500/20 text-gray-400' },
    busted: { label: 'Bust!', color: 'bg-red-500/20 text-red-400' },
    blackjack: { label: 'BJ!', color: 'bg-yellow-500/20 text-yellow-300' },
    done: { label: '', color: '' },
  };

  const resultBadge: Record<string, { label: string; color: string }> = {
    win: { label: 'WIN', color: 'bg-emerald-500/30 text-emerald-400' },
    lose: { label: 'LOSE', color: 'bg-red-500/30 text-red-400' },
    push: { label: 'PUSH', color: 'bg-blue-500/30 text-blue-400' },
    blackjack: { label: 'BJ!', color: 'bg-yellow-500/30 text-yellow-300' },
  };

  const badge = player.result ? resultBadge[player.result] : statusBadge[player.status];

  return (
    <div
      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
        isCurrentTurn ? 'ring-2 ring-yellow-500 bg-yellow-500/5' : ''
      } ${isMe ? 'bg-site-surface/50' : ''}`}
    >
      {/* Name */}
      <div className="flex items-center gap-1">
        {player.avatarUrl ? (
          <img src={player.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
        ) : null}
        <span className={`text-xs font-bold truncate max-w-[60px] ${isMe ? 'text-yellow-400' : 'text-site-text'}`}>
          {isMe ? 'You' : player.userName}
        </span>
      </div>

      {/* Cards */}
      {player.hand.length > 0 ? (
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex gap-0.5">
            {player.hand.map((card, i) => (
              <CardFace key={i} card={card} small />
            ))}
          </div>
          <span className="text-[10px] text-site-text-dim font-mono">
            {formatHandValue(player.hand)}
          </span>
        </div>
      ) : null}

      {/* Bet */}
      {player.bet > 0 && (
        <div className="flex items-center gap-0.5">
          <CoinIcon className="w-3 h-3" />
          <span className="text-[10px] text-yellow-500 font-bold">{player.bet}</span>
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
        <span className="text-[10px] text-emerald-400 font-bold">+{player.payout}</span>
      )}
    </div>
  );
}

// ── Table Component ────────────────────────────────────────────────

export function BlackjackTable() {
  const {
    players,
    dealerHand,
    dealerValue,
    currentTurnUserId,
    myUserId,
    tablePhase,
  } = useBlackjackStore();

  const showDealerHidden = tablePhase !== 'dealer_turn' && tablePhase !== 'results' && tablePhase !== 'payout';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Dealer area */}
      <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-emerald-900/30 border border-emerald-700/20 min-h-[80px]">
        <span className="text-xs text-site-text-dim font-bold uppercase tracking-wider">Dealer</span>
        {dealerHand.length > 0 ? (
          <div className="flex flex-col items-center gap-1">
            <Hand cards={dealerHand} hidden={showDealerHidden} />
            {dealerValue !== null && (
              <span className="text-xs text-site-text-dim font-mono">{dealerValue}</span>
            )}
            {!showDealerHidden && dealerHand.length > 0 && dealerValue === null && (
              <span className="text-xs text-site-text-dim font-mono">
                {formatHandValue(dealerHand)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-site-text-dim">Waiting to deal...</span>
        )}
      </div>

      {/* Players */}
      {players.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2 w-full">
          {players
            .sort((a, b) => a.seatIndex - b.seatIndex)
            .map((player) => (
              <PlayerSeatView
                key={player.userId}
                player={player}
                isCurrentTurn={currentTurnUserId === player.userId}
                isMe={player.userId === myUserId}
              />
            ))}
        </div>
      ) : (
        <p className="text-sm text-site-text-dim">No players at the table yet.</p>
      )}
    </div>
  );
}
