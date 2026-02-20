'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { UPGRADES } from '@/lib/temple-of-joy/data/upgrades';
import {
  computeIsUpgradeVisible,
  computeIsUpgradeAffordable,
  computeUpgradeCost,
} from '@/lib/temple-of-joy/engine';
import type { UpgradePath } from '@/lib/temple-of-joy/types';

const ALL_FILTERS: Array<UpgradePath | 'all'> = [
  'all', 'carnal', 'social', 'mind', 'spirit', 'indulgence', 'philosophy', 'offering', 'synergy',
];

const FILTER_LABELS: Record<UpgradePath | 'all', string> = {
  all: 'All',
  carnal: 'Carnal',
  social: 'Social',
  mind: 'Mind',
  spirit: 'Spirit',
  indulgence: 'Indulgence',
  philosophy: 'Philosophy',
  offering: 'Offering',
  synergy: 'Synergy',
};

interface UpgradeRowProps {
  upgradeId: string;
  purchased: boolean;
  affordable: boolean;
}

function UpgradeRow({ upgradeId, purchased, affordable }: UpgradeRowProps) {
  const state          = useTempleStore(s => s);
  const numberFormat   = useTempleStore(s => s.numberFormat);
  const purchaseUpgrade = useTempleStore(s => s.purchaseUpgrade);

  const def  = UPGRADES.find(u => u.id === upgradeId)!;
  const cost = computeUpgradeCost(upgradeId, state);

  const buildEffectSummary = () => {
    const parts: string[] = [];
    if (def.sourceMultiplier && def.targetSources?.length) {
      parts.push(`×${def.sourceMultiplier} ${def.targetSources.join(', ')} HPS`);
    }
    if (def.globalHPSMultiplier) parts.push(`×${def.globalHPSMultiplier} global HPS`);
    if (def.hpcMultiplier) parts.push(`×${def.hpcMultiplier} HPC`);
    if (def.hpcBonus) parts.push(`+${def.hpcBonus} HPC`);
    if (def.idleHPSMultiplier) parts.push(`×${def.idleHPSMultiplier} idle HPS`);
    if (def.karmaBonus) parts.push(`+${def.karmaBonus} karma`);
    if (def.karmaRateMultiplier) parts.push(`×${def.karmaRateMultiplier} karma/s`);
    return parts.join(' · ') || 'Special effect';
  };

  if (purchased) {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2 rounded-lg"
        style={{
          background: 'var(--temple-surface)',
          border: '1px solid var(--temple-border)',
          opacity: 0.5,
        }}
      >
        <span className="text-green-500 font-bold mt-0.5 shrink-0">✓</span>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold leading-tight"
            style={{ color: 'var(--temple-text)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            {def.name}
          </p>
          <p
            className="text-[11px] mt-0.5 font-medium leading-snug"
            style={{ color: 'var(--temple-text)', opacity: 0.7 }}
          >
            {buildEffectSummary()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg transition-all duration-150"
      style={{
        background: 'var(--temple-surface)',
        border: affordable
          ? '1px solid var(--temple-accent)'
          : '1px solid var(--temple-border)',
        boxShadow: affordable ? '0 0 8px rgba(212,168,71,0.18)' : undefined,
        opacity: affordable ? 1 : 0.65,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--temple-text)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            {def.name}
          </span>
          <span
            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium"
            style={{
              background: 'rgba(139,105,20,0.18)',
              color: 'var(--temple-accent)',
            }}
          >
            {def.path}
          </span>
        </div>
        <p
          className="text-xs italic mt-0.5 line-clamp-2"
          style={{ color: 'var(--temple-text)', opacity: 0.65 }}
        >
          {def.flavor}
        </p>
        <p
          className="text-[11px] mt-1 font-medium"
          style={{ color: 'var(--temple-text)', opacity: 0.8 }}
        >
          {buildEffectSummary()}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span
          className="text-[11px] tabular-nums font-semibold"
          style={{ color: 'var(--temple-text)', opacity: 0.75 }}
        >
          💰 {fmt(cost, numberFormat)}
        </span>
        <button
          onClick={() => purchaseUpgrade(upgradeId)}
          disabled={!affordable}
          className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide transition-all duration-150"
          style={{
            background: affordable ? 'var(--temple-accent)' : 'var(--temple-border)',
            color: '#fff',
            cursor: affordable ? 'pointer' : 'not-allowed',
            opacity: affordable ? 1 : 0.5,
          }}
        >
          Buy
        </button>
      </div>
    </div>
  );
}

export default function UpgradesPanel() {
  const state              = useTempleStore(s => s);
  const upgrades           = useTempleStore(s => s.upgrades);
  const upgradePathFilter  = useTempleStore(s => s.upgradePathFilter);
  const setUpgradePathFilter = useTempleStore(s => s.setUpgradePathFilter);

  const filteredUpgrades = UPGRADES.filter(u =>
    upgradePathFilter === 'all' || u.path === upgradePathFilter
  );

  const available  = filteredUpgrades.filter(u =>
    !upgrades.has(u.id) &&
    computeIsUpgradeVisible(u.id, state) &&
    computeIsUpgradeAffordable(u.id, state)
  ).sort((a, b) => computeUpgradeCost(a.id, state) - computeUpgradeCost(b.id, state));
  const locked     = filteredUpgrades.filter(u =>
    !upgrades.has(u.id) &&
    computeIsUpgradeVisible(u.id, state) &&
    !computeIsUpgradeAffordable(u.id, state)
  ).sort((a, b) => computeUpgradeCost(a.id, state) - computeUpgradeCost(b.id, state));
  const purchased  = filteredUpgrades.filter(u => upgrades.has(u.id));

  return (
    <div className="flex flex-col gap-3 w-full h-full min-h-0" style={{ color: 'var(--temple-text)' }}>
      <h2
        className="text-xs font-bold uppercase tracking-widest px-1"
        style={{ color: 'var(--temple-accent)' }}
      >
        Upgrades
      </h2>

      {/* Filter row */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setUpgradePathFilter(
              // clicking an already-active non-all filter resets to 'all'
              f !== 'all' && upgradePathFilter === f ? 'all' : f
            )}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-150"
            style={{
              background: upgradePathFilter === f
                ? 'var(--temple-accent)'
                : 'var(--temple-surface)',
              color: upgradePathFilter === f ? '#fff' : 'var(--temple-text)',
              border: upgradePathFilter === f
                ? '1px solid var(--temple-accent)'
                : '1px solid var(--temple-border)',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {/* Available */}
        {available.length > 0 && (
          <section>
            <p
              className="text-[10px] uppercase tracking-widest font-bold mb-2 px-1"
              style={{ color: 'var(--temple-accent)' }}
            >
              Available ({available.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {available.map(u => (
                <UpgradeRow
                  key={u.id}
                  upgradeId={u.id}
                  purchased={false}
                  affordable={true}
                />
              ))}
            </div>
          </section>
        )}

        {/* Locked */}
        {locked.length > 0 && (
          <section>
            <p
              className="text-[10px] uppercase tracking-widest font-bold mb-2 px-1"
              style={{ color: 'var(--temple-text)', opacity: 0.55 }}
            >
              Locked ({locked.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {locked.map(u => (
                <UpgradeRow
                  key={u.id}
                  upgradeId={u.id}
                  purchased={false}
                  affordable={false}
                />
              ))}
            </div>
          </section>
        )}

        {/* Purchased */}
        {purchased.length > 0 && (
          <section>
            <p
              className="text-[10px] uppercase tracking-widest font-bold mb-2 px-1"
              style={{ color: 'var(--temple-text)', opacity: 0.45 }}
            >
              Purchased ({purchased.length})
            </p>
            <div className="flex flex-col gap-1">
              {purchased.map(u => (
                <UpgradeRow
                  key={u.id}
                  upgradeId={u.id}
                  purchased={true}
                  affordable={false}
                />
              ))}
            </div>
          </section>
        )}

        {available.length === 0 && locked.length === 0 && purchased.length === 0 && (
          <p
            className="text-sm text-center py-8 italic"
            style={{ color: 'var(--temple-text)', opacity: 0.5 }}
          >
            No upgrades to show.
          </p>
        )}
      </div>
    </div>
  );
}
