'use client';

import { useState, useEffect } from 'react';
import { useBaccaratStore } from '@/lib/baccarat/store';
import { handValue, isNatural } from '@/lib/baccarat/logic';
import type { Card, BaccaratResult } from '@/lib/baccarat/logic';

// ── Card Rendering with Flip Animation ─────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = { H: '\u2665', D: '\u2666', C: '\u2663', S: '\u2660' };
const SUIT_COLORS: Record<string, string> = { H: 'text-red-500', D: 'text-red-500', C: 'text-gray-900', S: 'text-gray-900' };

function CardFace({ card, flipDelay }: { card: Card; flipDelay?: number }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFlipped(true), flipDelay ?? 100);
    return () => clearTimeout(timer);
  }, [flipDelay]);

  return (
    <div className="shrink-0" style={{ width: 52, height: 72, perspective: '600px' }}>
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
          className="rounded-lg border border-red-500/30"
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            background: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
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
          <span className="text-base font-bold text-gray-900">{card.rank}</span>
          <span className={`text-base ${SUIT_COLORS[card.suit]}`}>{SUIT_SYMBOLS[card.suit]}</span>
        </div>
      </div>
    </div>
  );
}

function CardBack() {
  return (
    <div
      className="shrink-0 rounded-lg border border-red-500/30"
      style={{
        width: 52,
        height: 72,
        background: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
      }}
    />
  );
}

// ── Hand Display ───────────────────────────────────────────────────

function HandDisplay({ cards, label, value, natural, staggerOffset }: {
  cards: Card[];
  label: string;
  value: number | null;
  natural: boolean;
  staggerOffset?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-site-text-dim font-bold uppercase tracking-wider">{label}</span>
      <div className="flex gap-1.5">
        {cards.length > 0 ? (
          cards.map((card, i) => (
            <CardFace
              key={`${card.rank}${card.suit}${i}`}
              card={card}
              flipDelay={(staggerOffset ?? 0) + i * 500}
            />
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
          <span className="text-2xl font-bold text-site-text font-mono">{value}</span>
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
  const cfg: Record<BaccaratResult, { label: string; color: string; bg: string }> = {
    player: { label: 'Player Wins!', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' },
    banker: { label: 'Banker Wins!', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
    tie: { label: 'Tie!', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
  };

  const c = cfg[result];

  return (
    <div className={`text-center py-3 px-6 rounded-xl border ${c.bg} animate-pulse`}>
      <span className={`text-xl font-bold ${c.color}`}>{c.label}</span>
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
            className={`w-3.5 h-3.5 rounded-full ${dotColor[result]} ${
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
          <span className="text-site-text-dim">Streak: {currentStreak}</span>
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

      {/* Dealing indicator */}
      {(tablePhase === 'dealing' || tablePhase === 'drawing') && (
        <div className="text-center">
          <span className="text-sm text-red-400 font-bold animate-pulse">
            {tablePhase === 'dealing' ? 'Dealing...' : 'Drawing third card...'}
          </span>
        </div>
      )}

      {/* Hands */}
      <div className={`flex items-start justify-center gap-6 sm:gap-10 p-5 rounded-xl bg-red-900/20 border border-red-700/20 min-h-32 w-full transition-all ${
        tablePhase === 'dealing' || tablePhase === 'drawing' ? 'ring-1 ring-red-500/30' : ''
      }`}>
        <HandDisplay
          cards={playerHand}
          label="Player"
          value={playerValue}
          natural={playerNatural}
          staggerOffset={0}
        />

        <div className="flex flex-col items-center justify-center py-4">
          <div className="w-px h-12 bg-red-700/30" />
          <span className="text-[10px] text-site-text-dim font-bold my-1.5">VS</span>
          <div className="w-px h-12 bg-red-700/30" />
        </div>

        <HandDisplay
          cards={bankerHand}
          label="Banker"
          value={bankerValue}
          natural={bankerNatural}
          staggerOffset={200}
        />
      </div>

      <HistoryScoreboard history={history} />
    </div>
  );
}
