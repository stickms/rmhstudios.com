'use client';

import { useState, useEffect } from 'react';
import { useBaccaratStore } from '@/lib/baccarat/store';
import { handValue, isNatural } from '@/lib/baccarat/logic';
import type { Card, BaccaratResult } from '@/lib/baccarat/logic';

// ── Card Rendering with Flip Animation ─────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_COLORS: Record<string, string> = { H: 'text-red-500', D: 'text-red-500', C: 'text-black', S: 'text-black' };

function CardFace({ card, delay }: { card: Card; delay?: number }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFlipped(true), delay ?? 0);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div className="w-12 h-17 perspective-500 shrink-0">
      <div
        className={`relative w-full h-full transition-transform duration-500 ease-out transform-3d ${
          flipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Back */}
        <div className="absolute inset-0 backface-hidden rounded-lg border border-red-500/30 bg-gradient-to-br from-red-800 to-red-950" />
        {/* Front */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-lg border border-gray-300 flex flex-col items-center justify-center bg-white">
          <span className="text-sm font-bold text-black">{card.rank}</span>
          <span className={`text-sm ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
        </div>
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div className="w-12 h-17 rounded-lg border border-red-500/30 bg-gradient-to-br from-red-800 to-red-950 shrink-0" />
  );
}

// ── Hand Display ───────────────────────────────────────────────────

function HandDisplay({ cards, label, value, natural }: {
  cards: Card[];
  label: string;
  value: number | null;
  natural: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-site-text-dim font-bold uppercase tracking-wider">{label}</span>
      <div className="flex gap-1.5">
        {cards.length > 0 ? (
          cards.map((card, i) => (
            <CardFace key={`${card.rank}${card.suit}${i}`} card={card} delay={i * 400} />
          ))
        ) : (
          <>
            <CardBack />
            <CardBack />
          </>
        )}
      </div>
      {value !== null && (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg font-bold text-site-text font-mono">{value}</span>
          {natural && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 uppercase tracking-wider">
              Natural
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Result Announcement ────────────────────────────────────────────

function ResultAnnouncement({ result }: { result: BaccaratResult }) {
  const config: Record<BaccaratResult, { label: string; color: string; bg: string }> = {
    player: { label: 'Player Wins', color: 'text-red-400', bg: 'bg-red-500/20' },
    banker: { label: 'Banker Wins', color: 'text-blue-400', bg: 'bg-blue-500/20' },
    tie: { label: 'Tie', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  };

  const c = config[result];

  return (
    <div className={`text-center py-2 px-4 rounded-lg ${c.bg} animate-bounce`}>
      <span className={`text-lg font-bold ${c.color}`}>{c.label}</span>
    </div>
  );
}

// ── History Bead Road ──────────────────────────────────────────────

function HistoryScoreboard({ history }: { history: BaccaratResult[] }) {
  if (history.length === 0) return null;

  const dotColor: Record<BaccaratResult, string> = {
    player: 'bg-red-500',
    banker: 'bg-blue-500',
    tie: 'bg-emerald-500',
  };

  // Calculate streaks
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
      {/* Bead road */}
      <div className="flex flex-wrap gap-1 justify-center">
        {lastResults.map((result, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${dotColor[result]}`}
            title={result.charAt(0).toUpperCase() + result.slice(1)}
          />
        ))}
      </div>

      {/* Stats bar */}
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
          <span className="text-site-text-dim">
            Streak: {currentStreak}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Table Component ────────────────────────────────────────────────

export function BaccaratTable() {
  const {
    playerHand,
    bankerHand,
    tablePhase,
    lastResult,
    history,
  } = useBaccaratStore();

  const showValues = tablePhase === 'dealing' || tablePhase === 'drawing' || tablePhase === 'results';
  const playerValue = showValues && playerHand.length > 0 ? handValue(playerHand) : null;
  const bankerValue = showValues && bankerHand.length > 0 ? handValue(bankerHand) : null;
  const playerNatural = playerHand.length === 2 && isNatural(playerHand);
  const bankerNatural = bankerHand.length === 2 && isNatural(bankerHand);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Result announcement */}
      {tablePhase === 'results' && lastResult && (
        <ResultAnnouncement result={lastResult.result} />
      )}

      {/* Hands */}
      <div className={`flex items-start justify-center gap-6 sm:gap-10 p-4 rounded-xl bg-red-900/20 border border-red-700/20 min-h-28 w-full transition-all ${
        tablePhase === 'dealing' || tablePhase === 'drawing' ? 'ring-1 ring-red-500/30' : ''
      }`}>
        {/* Player hand */}
        <HandDisplay
          cards={playerHand}
          label="Player"
          value={playerValue}
          natural={playerNatural}
        />

        {/* Divider */}
        <div className="flex flex-col items-center justify-center h-full py-4">
          <div className="w-px h-16 bg-red-700/30" />
          <span className="text-[10px] text-site-text-dim font-bold my-1">VS</span>
          <div className="w-px h-16 bg-red-700/30" />
        </div>

        {/* Banker hand */}
        <HandDisplay
          cards={bankerHand}
          label="Banker"
          value={bankerValue}
          natural={bankerNatural}
        />
      </div>

      {/* History scoreboard */}
      <HistoryScoreboard history={history} />
    </div>
  );
}
