'use client';

import { useTranslation } from "react-i18next";
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { WHEEL_UPGRADES } from '@/lib/temple-of-joy/data/wheel';
import { computeTranscendenceThreshold } from '@/lib/temple-of-joy/engine';
import { fmt } from '@/lib/temple-of-joy/numbers';
import type { WheelTier } from '@/lib/temple-of-joy/types';

interface WheelCardProps {
  upgradeId: string;
}

function WheelCard({ upgradeId }: WheelCardProps) {
  const { t } = useTranslation("c-temple-of-joy");
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
          {t("requires-label", { defaultValue: "Requires:" })}{' '}
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
          {!requiresMet ? t("btn-locked", { defaultValue: "Locked" }) : !canAfford ? t("btn-need-shards", { defaultValue: "Need shards" }) : t("btn-purchase", { defaultValue: "Purchase" })}
        </button>
      )}
    </div>
  );
}

export default function WheelOfSamsara() {
  const { t } = useTranslation("c-temple-of-joy");
  const blissShards    = useTempleStore(s => s.blissShards);
  const prestigeCount  = useTempleStore(s => s.prestigeCount);
  const runHappiness   = useTempleStore(s => s.runHappiness);
  const numberFormat   = useTempleStore(s => s.numberFormat);

  const nextThreshold = computeTranscendenceThreshold(prestigeCount);

  const TIER_LABELS: Record<WheelTier, string> = {
    1: t("tier-1", { defaultValue: "Tier I — The First Steps" }),
    2: t("tier-2", { defaultValue: "Tier II — Deepening" }),
    3: t("tier-3", { defaultValue: "Tier III — Enlightenment" }),
    4: t("tier-4", { defaultValue: "Tier IV — The Infinite" }),
    5: t("tier-5", { defaultValue: "Tier V — Beyond the Wheel" }),
    6: t("tier-6", { defaultValue: "Tier VI — Celestial" }),
    7: t("tier-7", { defaultValue: "Tier VII — Cosmic" }),
    8: t("tier-8", { defaultValue: "Tier VIII — Eternal" }),
    9: t("tier-9", { defaultValue: "Tier IX — Ascendant" }),
    10: t("tier-10", { defaultValue: "Tier X — Omega" }),
  };

  const tiers: WheelTier[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <div className="flex flex-col gap-5 w-full" style={{ color: 'var(--temple-text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: 'var(--temple-accent)' }}
        >
          {t("wheel-of-samsara", { defaultValue: "Wheel of Samsara" })}
        </h2>
        <span
          className="text-sm font-bold"
          style={{ color: 'var(--temple-accent)' }}
        >
          💎 {blissShards} {t("bliss-shards", { defaultValue: "Bliss Shards" })}
        </span>
      </div>

      {/* Transcendence threshold */}
      {prestigeCount > 0 && (
        <p
          className="text-xs text-center"
          style={{ color: 'var(--temple-text)', opacity: 0.7 }}
        >
          {t("next-transcendence-at", { defaultValue: "Next transcendence at" })}{' '}
          <span style={{ color: 'var(--temple-accent)', fontWeight: 600 }}>
            {fmt(nextThreshold, numberFormat)}
          </span>{' '}
          {t("run-happiness-label", { defaultValue: "run happiness" })}
          {' '}({fmt(runHappiness, numberFormat)} {t("earned-this-run", { defaultValue: "earned this run" })})
        </p>
      )}

      {/* Pre-transcendence gate */}
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
            🔒 {t("transcend-once-to-unlock", { defaultValue: "Transcend once to unlock" })}
          </p>
          <p
            className="text-xs"
            style={{ color: 'var(--temple-text)', opacity: 0.65 }}
          >
            {t("requires-happiness", { defaultValue: "Requires" })} <span style={{ color: 'var(--temple-accent)' }}>{fmt(nextThreshold, numberFormat)}</span> {t("run-happiness-label", { defaultValue: "run happiness" })}.
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
