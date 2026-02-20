'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import { WHEEL_UPGRADES } from '@/lib/temple-of-joy/data/wheel';
import { computeTranscendenceThreshold } from '@/lib/temple-of-joy/engine';
import type { WheelTier } from '@/lib/temple-of-joy/types';

const TIER_LABELS: Record<WheelTier, string> = {
  1: 'Tier I — The First Steps',
  2: 'Tier II — Deepening',
  3: 'Tier III — Enlightenment',
  4: 'Tier IV — The Infinite',
};

interface WheelCardProps {
  upgradeId: string;
}

function WheelCard({ upgradeId }: WheelCardProps) {
  const blissShards        = useTempleStore(s => s.blissShards);
  const wheelPurchased     = useTempleStore(s => s.wheelPurchased);
  const purchaseWheelUpgrade = useTempleStore(s => s.purchaseWheelUpgrade);

  const def = WHEEL_UPGRADES.find(w => w.id === upgradeId)!;

  const isPurchased = wheelPurchased.has(upgradeId);
  const requiresMet = !def.requires?.length ||
    def.requires.every(r => wheelPurchased.has(r));
  const canAfford   = blissShards >= def.shardCost;
  const canBuy      = !isPurchased && requiresMet && canAfford;

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2 transition-all duration-150"
      style={{
        background: 'var(--temple-surface)',
        border: isPurchased
          ? '1px solid var(--temple-accent)'
          : requiresMet
            ? '1px solid var(--temple-border)'
            : '1px dashed var(--temple-border)',
        opacity: isPurchased ? 0.7 : requiresMet ? 1 : 0.45,
        boxShadow: isPurchased ? '0 0 8px rgba(212,168,71,0.2)' : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm font-semibold leading-tight flex-1"
          style={{ color: 'var(--temple-text)' }}
        >
          {isPurchased && (
            <span className="mr-1" style={{ color: 'var(--temple-accent)' }}>✓</span>
          )}
          {def.name}
        </p>
        <span
          className="shrink-0 text-xs font-bold tabular-nums"
          style={{ color: isPurchased ? 'var(--temple-text)' : 'var(--temple-accent)' }}
        >
          💎 {def.shardCost}
        </span>
      </div>

      {/* Description */}
      <p
        className="text-xs leading-snug"
        style={{ color: 'var(--temple-text)', opacity: 0.8 }}
      >
        {def.description}
      </p>

      {/* Requirements */}
      {def.requires && def.requires.length > 0 && (
        <p
          className="text-[10px]"
          style={{ color: requiresMet ? 'var(--temple-text)' : 'var(--temple-text)', opacity: requiresMet ? 0.5 : 0.5 }}
        >
          Requires:{' '}
          {def.requires.map((r, i) => {
            const met = wheelPurchased.has(r);
            const reqDef = WHEEL_UPGRADES.find(w => w.id === r);
            return (
              <span
                key={r}
                style={{ color: met ? 'var(--temple-accent)' : 'var(--temple-text)', opacity: met ? 1 : 0.55 }}
              >
                {reqDef?.name ?? r}{i < def.requires!.length - 1 ? ', ' : ''}
              </span>
            );
          })}
        </p>
      )}

      {/* Buy button */}
      {!isPurchased && (
        <button
          onClick={() => purchaseWheelUpgrade(upgradeId)}
          disabled={!canBuy}
          className="mt-auto self-end px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide transition-all duration-150"
          style={{
            background: canBuy ? 'var(--temple-accent)' : 'var(--temple-border)',
            color: '#fff',
            cursor: canBuy ? 'pointer' : 'not-allowed',
            opacity: canBuy ? 1 : 0.5,
          }}
        >
          {!requiresMet ? 'Locked' : !canAfford ? 'Need shards' : 'Purchase'}
        </button>
      )}
    </div>
  );
}

export default function WheelOfSamsara() {
  const blissShards    = useTempleStore(s => s.blissShards);
  const prestigeCount  = useTempleStore(s => s.prestigeCount);

  const threshold = computeTranscendenceThreshold(0);

  const tiers: WheelTier[] = [1, 2, 3, 4];

  return (
    <div className="flex flex-col gap-5 w-full" style={{ color: 'var(--temple-text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--temple-accent)' }}
        >
          Wheel of Samsara
        </h2>
        <span
          className="text-sm font-bold"
          style={{ color: 'var(--temple-accent)' }}
        >
          💎 {blissShards} Bliss Shards
        </span>
      </div>

      {/* Pre-prestige gate */}
      {prestigeCount === 0 && (
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: 'var(--temple-surface)',
            border: '1px dashed var(--temple-border)',
          }}
        >
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: 'var(--temple-text)' }}
          >
            🔒 Transcend once to unlock
          </p>
          <p
            className="text-xs"
            style={{ color: 'var(--temple-text)', opacity: 0.65 }}
          >
            Requires <span style={{ color: 'var(--temple-accent)' }}>{threshold.toLocaleString()}</span> lifetime happiness.
          </p>
        </div>
      )}

      {/* Tier sections */}
      {tiers.map(tier => {
        const tierUpgrades = WHEEL_UPGRADES.filter(w => w.tier === tier);
        return (
          <section key={tier}>
            <p
              className="text-[11px] uppercase tracking-widest font-bold mb-2"
              style={{ color: 'var(--temple-accent)' }}
            >
              {TIER_LABELS[tier]}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tierUpgrades.map(w => (
                <WheelCard
                  key={w.id}
                  upgradeId={w.id}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
