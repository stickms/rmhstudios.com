'use client';

import { useEffect, useRef } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { computeSourceCost, computeSourceCostN, computeSourceHPS, computeMaxAffordable, computeSourcePrestigeReq } from '@/lib/temple-of-joy/engine';
import type { SourceId, GameState } from '@/lib/temple-of-joy/types';

type BuyQty = 1 | 10 | 100 | 'max';

function isUnlocked(
  baseCost: number,
  count: number,
  lifetimeHPUnlock: number | undefined,
  peakHappiness: number,
  lifetimeHappiness: number,
  SourceId: SourceId,
  state: GameState,
) {
  const prestigeReq = computeSourcePrestigeReq(SourceId, state);
  if (prestigeReq > 0 && state.prestigeCount < prestigeReq) return false;
  if (count > 0) return true;
  if (peakHappiness >= baseCost * 0.1) return true;
  if (lifetimeHPUnlock !== undefined && lifetimeHappiness >= lifetimeHPUnlock) return true;
  return false;
}

interface SourceRowProps {
  id: SourceId;
  buyQty: BuyQty;
}

function SourceRow({ id, buyQty }: SourceRowProps) {
  const state = useTempleStore(s => s);
  const peakHappiness = useTempleStore(s => s.peakHappiness);
  const lifetimeHappiness = useTempleStore(s => s.lifetimeHappiness);
  const sources = useTempleStore(s => s.sources);
  const numberFormat = useTempleStore(s => s.numberFormat);
  const buySource = useTempleStore(s => s.buySource);
  const buySourceN = useTempleStore(s => s.buySourceN);
  const buySourceMax = useTempleStore(s => s.buySourceMax);

  const pulseKeyRef = useRef(0);
  const prevCountRef = useRef<number | null>(null);

  const count = sources[id] ?? 0;

  useEffect(() => {
    if (prevCountRef.current !== null && prevCountRef.current === 0 && count > 0) {
      pulseKeyRef.current++;
    }
    prevCountRef.current = count;
  }, [count]);

  const def = SOURCES.find(b => b.id === id)!;
  const totalHps = computeSourceHPS(id, state);

  // If count is 0, compute hypothetical HPS for 1 source
  const perSourceHps = count > 0
    ? totalHps / count
    : computeSourceHPS(id, { ...state, sources: { ...state.sources, [id]: 1 } });

  const unlocked = isUnlocked(
    def.baseCost,
    count,
    def.lifetimeHPUnlock,
    peakHappiness,
    lifetimeHappiness,
    id,
    state,
  );

  // Cost / affordability based on selected quantity
  let displayCost: number;
  let maxN = 0;
  let canAfford: boolean;

  if (buyQty === 'max') {
    maxN = computeMaxAffordable(id, state);
    displayCost = maxN > 0 ? computeSourceCostN(id, count, maxN, state) : computeSourceCost(id, count, state);
    canAfford = maxN > 0;
  } else {
    displayCost = computeSourceCostN(id, count, buyQty, state);
    canAfford = state.happiness >= displayCost;
  }

  const handleBuy = () => {
    if (buyQty === 'max') {
      buySourceMax(id);
    } else if (buyQty === 1) {
      buySource(id);
    } else {
      buySourceN(id, buyQty as number);
    }
  };

  if (!unlocked) {
    return null;
  }

  return (
    <div
      key={pulseKeyRef.current}
      className="flex items-center gap-3 p-3 rounded-lg transition-all duration-150"
      style={{
        background: 'var(--temple-surface)',
        border: canAfford
          ? '1px solid var(--temple-accent)'
          : '1px solid var(--temple-border)',
        boxShadow: canAfford ? '0 0 8px rgba(212,168,71,0.2)' : undefined,
        animation: pulseKeyRef.current > 0 ? 'templeUnlockPulse 0.7s ease-out' : undefined,
      }}
    >
      {/* Icon */}
      <span className="text-2xl shrink-0">{def.icon}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold leading-tight"
          style={{ color: 'var(--temple-text)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
        >
          {def.name}
        </p>
        <p
          className="text-[11px] leading-snug mt-0.5"
          style={{ color: 'var(--temple-text)', opacity: 0.6, fontFamily: 'inherit' }}
        >
          {def.tagline}
        </p>
        <p
          className="text-[11px] tabular-nums mt-0.5"
          style={{ color: 'var(--temple-text)', opacity: 0.65 }}
        >
          {count === 0
            ? `${fmt(perSourceHps, numberFormat)}/s each`
            : `${fmt(perSourceHps, numberFormat)}/s each · ${fmt(totalHps, numberFormat)}/s total`}
        </p>
      </div>

      {/* Count */}
      <span
        className="text-lg font-bold tabular-nums w-10 text-right shrink-0"
        style={{ color: 'var(--temple-accent)' }}
      >
        {count}
      </span>

      {/* Buy button */}
      <button
        onClick={handleBuy}
        disabled={!canAfford}
        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all duration-150"
        style={{
          background: canAfford ? 'var(--temple-accent)' : 'var(--temple-border)',
          color: canAfford ? '#fff' : 'var(--temple-text)',
          opacity: canAfford ? 1 : 0.5,
          cursor: canAfford ? 'pointer' : 'not-allowed',
          minWidth: 72,
        }}
      >
        <span className="block text-[10px] font-normal tabular-nums">
          💰 {fmt(displayCost, numberFormat)}
        </span>
        {buyQty === 'max' ? `MAX (${canAfford ? maxN : 0})` : `×${buyQty}`}
      </button>
    </div>
  );
}

export default function SourcesPanel() {
  const buyQty = useTempleStore(s => s.sourceBuyQty);
  const setBuyQty = useTempleStore(s => s.setSourceBuyQty);
  const theme = useTempleStore(s => s.theme);

  const QTY_OPTIONS: BuyQty[] = [1, 10, 100, 'max'];

  return (
    <div
      className="flex flex-col gap-2 w-full h-full min-h-0"
      style={{ color: 'var(--temple-text)' }}
    >
      {/* Header + Quantity selector */}
      <div className="flex items-center justify-between gap-2 px-1 mb-1">
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--temple-accent)' }}
        >
          🌿 Sources of Joy
        </h2>
        <div className="flex gap-1">
          {QTY_OPTIONS.map(q => (
            <button
              key={q}
              onClick={() => setBuyQty(q)}
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all"
              style={{
                background: buyQty === q
                  ? 'var(--temple-accent)'
                  : (theme === 'dark' ? '#2c1d12' : '#ede7d9'),
                color: buyQty === q ? '#fff' : 'var(--temple-text)',
                border: buyQty === q
                  ? '1px solid var(--temple-accent)'
                  : '1px solid var(--temple-border)',
              }}
            >
              {q === 'max' ? 'MAX' : `×${q}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto pr-1">
        {SOURCES.map(b => (
          <SourceRow key={b.id} id={b.id} buyQty={buyQty} />
        ))}
      </div>
    </div>
  );
}
