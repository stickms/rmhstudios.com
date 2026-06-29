'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { ASCENSION_UPGRADES } from '@/lib/temple-of-joy/data/ascension';
import { computeAscensionPrestigeReq, computeRadianceGain, computeCanAscend } from '@/lib/temple-of-joy/engine';

export default function AscensionPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const radiance = useTempleStore((s) => s.radiance);
  const lifetimeRadiance = useTempleStore((s) => s.lifetimeRadiance);
  const ascensionCount = useTempleStore((s) => s.ascensionCount);
  const prestigeCount = useTempleStore((s) => s.prestigeCount);
  const ascensionUpgrades = useTempleStore((s) => s.ascensionUpgrades);
  const numberFormat = useTempleStore((s) => s.numberFormat);
  const ascend = useTempleStore((s) => s.ascend);
  const purchase = useTempleStore((s) => s.purchaseAscensionUpgrade);

  const state = useTempleStore.getState();
  const req = computeAscensionPrestigeReq(state);
  const gain = computeRadianceGain(state);
  const canAscend = computeCanAscend(state);
  const [confirm, setConfirm] = useState(false);

  const tiers = [...new Set(ASCENSION_UPGRADES.map((u) => u.tier))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4" style={{ color: 'var(--temple-text)' }}>
      {/* Summary */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--temple-surface)', border: '1px solid var(--temple-accent)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm uppercase tracking-widest" style={{ opacity: 0.7 }}>
            ☀️ {t('radiance', { defaultValue: 'Radiance' })}
          </span>
          <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--temple-accent-bright, #f0c84a)' }}>
            {fmt(radiance, numberFormat)}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-xs" style={{ opacity: 0.6 }}>
          <span>{t('ascensions', { defaultValue: 'Ascensions' })}: {ascensionCount}</span>
          <span>{t('lifetime-radiance', { defaultValue: 'Lifetime' })}: {fmt(lifetimeRadiance, numberFormat)}</span>
        </div>
      </div>

      {/* Ascend action */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--temple-surface)', border: '1px solid var(--temple-border)' }}
      >
        <p className="text-sm leading-relaxed" style={{ opacity: 0.85 }}>
          {t(
            'ascension-explainer',
            {
              defaultValue:
                'Ascend to reset your prestige layer — sources, upgrades, wheel, relics and bliss shards — in exchange for permanent Radiance and access to compounding Ascension upgrades.',
            },
          )}
        </p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span style={{ opacity: 0.7 }}>
            {t('prestige', { defaultValue: 'Prestige' })}: <b>{prestigeCount}</b> / {req}
          </span>
          <span style={{ color: 'var(--temple-accent)' }}>
            +{fmt(gain, numberFormat)} ☀️
          </span>
        </div>

        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            disabled={!canAscend}
            className="mt-3 w-full rounded-lg py-2.5 text-sm font-bold uppercase tracking-wide transition-all"
            style={{
              background: canAscend ? 'var(--temple-accent)' : 'var(--temple-border)',
              color: canAscend ? '#fff' : 'var(--temple-text)',
              opacity: canAscend ? 1 : 0.5,
              cursor: canAscend ? 'pointer' : 'not-allowed',
            }}
          >
            {canAscend
              ? t('ascend', { defaultValue: 'Ascend' })
              : t('ascend-locked', { defaultValue: 'Need {{n}} prestige', n: req })}
          </button>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => { ascend(); setConfirm(false); }}
              className="flex-1 rounded-lg py-2.5 text-sm font-bold uppercase tracking-wide"
              style={{ background: 'var(--temple-accent)', color: '#fff' }}
            >
              {t('confirm-ascend', { defaultValue: 'Confirm — Ascend' })}
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="rounded-lg px-4 py-2.5 text-sm font-bold uppercase"
              style={{ border: '1px solid var(--temple-border)', color: 'var(--temple-text)' }}
            >
              {t('cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        )}
      </div>

      {/* Upgrade tree */}
      {tiers.map((tier) => (
        <div key={tier}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--temple-accent)' }}>
            {t('tier', { defaultValue: 'Tier' })} {tier}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ASCENSION_UPGRADES.filter((u) => u.tier === tier).map((u) => {
              const owned = ascensionUpgrades.has(u.id);
              const prereqMet = !u.requires || u.requires.every((id) => ascensionUpgrades.has(id));
              const affordable = radiance >= u.cost && prereqMet && !owned;
              return (
                <button
                  key={u.id}
                  onClick={() => affordable && purchase(u.id)}
                  disabled={!affordable}
                  className="rounded-lg p-3 text-left transition-all"
                  style={{
                    background: owned ? 'rgba(212,168,71,0.15)' : 'var(--temple-surface)',
                    border: owned ? '1px solid var(--temple-accent)' : '1px solid var(--temple-border)',
                    opacity: owned ? 1 : prereqMet ? 1 : 0.45,
                    cursor: affordable ? 'pointer' : 'default',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: owned ? 'var(--temple-accent-bright, #f0c84a)' : 'var(--temple-text)' }}>
                      {u.name}
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: owned ? 'var(--temple-accent)' : 'var(--temple-text)', opacity: owned ? 1 : 0.7 }}>
                      {owned ? '✓' : `${fmt(u.cost, numberFormat)} ☀️`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug" style={{ opacity: 0.65 }}>{u.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
