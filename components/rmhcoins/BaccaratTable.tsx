'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBaccaratStore } from '@/lib/baccarat/store';
import { handValue, isNatural } from '@/lib/baccarat/logic';
import type { Card, BaccaratResult } from '@/lib/baccarat/logic';
import type { BetType } from '@/lib/baccarat/types';
import { CoinIcon } from './CoinIcon';

// ── Card Rendering with Flip Animation ─────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_COLORS: Record<string, string> = { H: 'text-red-500', D: 'text-red-500', C: 'text-gray-900', S: 'text-gray-900' };

const FLIP_DURATION_MS = 600;

function CardFace({ card }: { card: Card }) {
  const [flipped, setFlipped] = useState(false);

  // Flip shortly after mount. Cards already arrive staggered from the server,
  // so we only need a small delay to trigger the CSS transition.
  useEffect(() => {
    const timer = setTimeout(() => setFlipped(true), 60);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="shrink-0 w-11 h-15 sm:w-13 sm:h-18" style={{ perspective: '600px' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transition: 'transform 0.6s ease-out',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Back */}
        <div
          className="rounded-lg border border-site-accent/40"
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            background: 'linear-gradient(135deg, var(--site-accent), var(--site-accent-hover))',
          }}
        />
        {/* Front */}
        <div
          className="rounded-lg border border-gray-300 flex flex-col items-center justify-center bg-white"
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <span className="text-sm sm:text-base font-bold text-gray-900">{card.rank}</span>
          <span className={`text-sm sm:text-base ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
        </div>
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div
      className="shrink-0 w-11 h-15 sm:w-13 sm:h-18 rounded-lg border border-site-accent/40"
      style={{
        background: 'linear-gradient(135deg, var(--site-accent), var(--site-accent-hover))',
      }}
    />
  );
}

// ── Hand Display ───────────────────────────────────────────────────

function HandDisplay({ cards, label, value, natural, showValue }: {
  cards: Card[];
  label: string;
  value: number | null;
  natural: boolean;
  showValue: boolean;
}) {
  const { t } = useTranslation("c-rmhcoins");
  // Gate the running total behind the flip animation: only reveal the value
  // once the most recently dealt card has finished flipping face-up.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (cards.length === 0) {
      setSettled(false);
      return;
    }
    setSettled(false);
    const timer = setTimeout(() => setSettled(true), FLIP_DURATION_MS + 120);
    return () => clearTimeout(timer);
  }, [cards.length]);

  const valueVisible = showValue && settled && value !== null;

  return (
    <div className="flex flex-col items-center gap-1.5 sm:gap-2 min-w-0">
      <span className="text-[10px] sm:text-xs text-site-text-dim font-bold uppercase tracking-wider">{label}</span>
      <div className="flex gap-1 sm:gap-1.5">
        {cards.length > 0 ? (
          cards.map((card, i) => (
            <CardFace
              key={`${card.rank}${card.suit}${i}`}
              card={card}
            />
          ))
        ) : (
          <>
            <CardBack />
            <CardBack />
          </>
        )}
      </div>
      {valueVisible && (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xl sm:text-2xl font-bold text-site-text font-mono">{value}</span>
          {natural && (
            <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full bg-site-accent-dim text-site-accent uppercase tracking-wider">
              {t("natural", { defaultValue: "Natural" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Result Announcement ────────────────────────────────────────────

function ResultAnnouncement({ result }: { result: BaccaratResult }) {
  const { t } = useTranslation("c-rmhcoins");
  const cfg: Record<BaccaratResult, { label: string; color: string; bg: string }> = {
    player: { label: t("player-wins", { defaultValue: "Player Wins!" }), color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' },
    banker: { label: t("banker-wins", { defaultValue: "Banker Wins!" }), color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
    tie: { label: t("tie", { defaultValue: "Tie!" }), color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
  };

  const c = cfg[result];

  return (
    <div className={`text-center py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl border ${c.bg} animate-pulse`}>
      <span className={`text-lg sm:text-xl font-bold ${c.color}`}>{c.label}</span>
    </div>
  );
}

// ── History Bead Road ──────────────────────────────────────────────

function HistoryScoreboard({ history }: { history: BaccaratResult[] }) {
  const { t } = useTranslation("c-rmhcoins");
  if (history.length === 0) return null;

  const dotColor: Record<BaccaratResult, string> = {
    player: 'bg-red-500',
    banker: 'bg-blue-500',
    tie: 'bg-emerald-500',
  };

  let currentStreak = 0;
  if (history.length > 0) {
    const lastResult = history[history.length - 1];
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] === lastResult) currentStreak++;
      else break;
    }
  }

  const lastResults = history.slice(-30);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 justify-center">
        {lastResults.map((result, i) => (
          <div
            key={i}
            className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ${dotColor[result]} ${
              i === lastResults.length - 1 ? 'ring-2 ring-white/50 scale-110' : ''
            }`}
            title={result.charAt(0).toUpperCase() + result.slice(1)}
          />
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 text-[10px]">
        <span className="text-red-400 font-bold">
          P: {history.filter((r) => r === 'player').length}
        </span>
        <span className="text-blue-400 font-bold">
          B: {history.filter((r) => r === 'banker').length}
        </span>
        <span className="text-emerald-400 font-bold">
          T: {history.filter((r) => r === 'tie').length}
        </span>
        {currentStreak > 1 && (
          <span className="text-site-text-dim">{t("streak", { defaultValue: "Streak: {{count}}", count: currentStreak })}</span>
        )}
      </div>
    </div>
  );
}

// ── Table Component ────────────────────────────────────────────────

const BET_LABELS: Record<BetType, { short: string; color: string }> = {
  player: { short: 'P', color: 'bg-red-500/20 text-red-400' },
  banker: { short: 'B', color: 'bg-blue-500/20 text-blue-400' },
  tie: { short: 'T', color: 'bg-emerald-500/20 text-emerald-400' },
  playerPair: { short: 'PP', color: 'bg-red-500/10 text-red-300' },
  bankerPair: { short: 'BP', color: 'bg-blue-500/10 text-blue-300' },
  playerDragon: { short: 'PD', color: 'bg-red-500/10 text-red-300' },
  bankerDragon: { short: 'BD', color: 'bg-blue-500/10 text-blue-300' },
};

export function BaccaratTable() {
  const { t } = useTranslation("c-rmhcoins");
  const {
    playerHand,
    bankerHand,
    tablePhase,
    lastResult,
    history,
    players,
    myUserId,
  } = useBaccaratStore();

  const showValues = tablePhase === 'dealing' || tablePhase === 'drawing' || tablePhase === 'results';
  const playerValue = playerHand.length > 0 ? handValue(playerHand) : null;
  const bankerValue = bankerHand.length > 0 ? handValue(bankerHand) : null;
  const playerNatural = playerHand.length === 2 && isNatural(playerHand);
  const bankerNatural = bankerHand.length === 2 && isNatural(bankerHand);

  // Collect active bets from all players
  const activeBets = players
    .filter((p) => p.totalBetThisRound > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Result announcement */}
      {tablePhase === 'results' && lastResult && (
        <ResultAnnouncement result={lastResult.result} />
      )}

      {/* Dealing indicator */}
      {(tablePhase === 'dealing' || tablePhase === 'drawing') && (
        <div className="text-center">
          <span className="text-sm text-site-accent font-bold animate-pulse">
            {tablePhase === 'dealing' ? t("dealing", { defaultValue: "Dealing..." }) : t("drawing-third-card", { defaultValue: "Drawing third card..." })}
          </span>
        </div>
      )}

      {/* Hands — responsive gap and padding */}
      <div className={`flex items-start justify-center gap-4 sm:gap-10 p-3 sm:p-5 rounded-xl bg-site-bg-subtle border border-site-border min-h-28 sm:min-h-32 w-full transition-all ${
        tablePhase === 'dealing' || tablePhase === 'drawing' ? 'ring-1 ring-site-accent/40' : ''
      }`}>
        <HandDisplay
          cards={playerHand}
          label={t("player", { defaultValue: "Player" })}
          value={playerValue}
          natural={playerNatural}
          showValue={showValues}
        />

        <div className="flex flex-col items-center justify-center py-3 sm:py-4">
          <div className="w-px h-8 sm:h-12 bg-site-border" />
          <span className="text-[10px] text-site-text-dim font-bold my-1">{t("vs", { defaultValue: "VS" })}</span>
          <div className="w-px h-8 sm:h-12 bg-site-border" />
        </div>

        <HandDisplay
          cards={bankerHand}
          label={t("banker", { defaultValue: "Banker" })}
          value={bankerValue}
          natural={bankerNatural}
          showValue={showValues}
        />
      </div>

      {/* Players & their bets — scrollable on mobile */}
      {activeBets.length > 0 && (
        <div className="w-full flex flex-col gap-1.5">
          <span className="text-[10px] text-site-text-dim uppercase tracking-wider font-bold text-center">{t("bets-at-table", { defaultValue: "Bets at Table" })}</span>
          <div className="flex flex-wrap justify-center gap-2">
            {activeBets.map((p) => {
              const isMe = p.userId === myUserId;
              const betEntries = (Object.entries(p.bets) as [BetType, number][]).filter(([, v]) => v > 0);
              return (
                <div
                  key={p.userId}
                  className={`flex flex-col gap-1 p-2 rounded-lg border ${
                    isMe ? 'bg-site-accent-dim border-site-accent/30' : 'bg-site-surface/50 border-site-border/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {p.avatarUrl && <img src={p.avatarUrl} alt="" className="w-4 h-4 rounded-full" />}
                    <span className={`text-xs font-bold truncate max-w-20 ${isMe ? 'text-site-accent' : 'text-site-text'}`}>
                      {isMe ? t("you", { defaultValue: "You" }) : p.userName}
                    </span>
                    <div className="flex items-center gap-0.5 ml-auto">
                      <CoinIcon className="w-3 h-3" />
                      <span className="text-[10px] font-bold text-yellow-500">{p.totalBetThisRound}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {betEntries.map(([type, amount]) => {
                      const cfg = BET_LABELS[type];
                      return (
                        <span key={type} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.color}`}>
                          {cfg.short} {amount}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <HistoryScoreboard history={history} />
    </div>
  );
}
