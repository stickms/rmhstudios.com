'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLEAR_ENDINGS,
  markCleared,
  readMeta,
  startNewGamePlus,
  switchSlot,
  type HouseRule,
} from '@/lib/house-always-wins/ngplus';

export function useRuleLabel() {
  const { t } = useTranslation('f-worlds');
  const labels: Record<HouseRule, string> = {
    fastLasers: t('ng-rule-fast-lasers', { defaultValue: 'Rigged Lasers: beams cycle 40% faster' }),
    highStakes: t('ng-rule-high-stakes', {
      defaultValue: 'High Stakes: chips and tolls both cost 50% more',
    }),
  };
  return (rule: HouseRule) => labels[rule];
}

/** Small tag in the HUD while playing the New Game+ slot. */
export function NgPlusTag() {
  const { t } = useTranslation('f-worlds');
  const label = useRuleLabel();
  const [meta, setMeta] = useState<ReturnType<typeof readMeta> | null>(null);
  useEffect(() => setMeta(readMeta()), []);
  if (!meta || meta.slot !== 'ngplus') return null;
  return (
    <div
      data-floating="feature-overlay"
      className="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-black/60 px-2 py-1 font-mono text-[10px] tracking-wide text-[#f0c674]"
    >
      {t('ng-tag', { defaultValue: 'NEW GAME+ {{n}}', n: meta.cycles })} · {label(meta.rule)}
    </div>
  );
}

/** Ending screen: record the clear and offer New Game+. */
export function NgPlusOffer({ endingId }: { endingId: string }) {
  const { t } = useTranslation('f-worlds');
  const cleared = CLEAR_ENDINGS.includes(endingId);
  useEffect(() => {
    if (cleared) markCleared();
  }, [cleared]);
  if (!cleared) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-[#cabba0]">
        {t('ng-offer', {
          defaultValue:
            'The House shuffles the floor and changes one rule. Same casino, different luck.',
        })}
      </p>
      <button
        onClick={() => {
          startNewGamePlus();
          window.location.reload();
        }}
        className="rounded-lg border border-[#d4a054]/40 bg-[#d4a054]/10 px-6 py-2.5 font-mono text-sm tracking-wide text-[#f0c674] transition-colors hover:bg-[#d4a054]/20"
      >
        {t('ng-start', { defaultValue: 'New Game+' })}
      </button>
    </div>
  );
}

/** Pause menu: switch between the classic save and the New Game+ save. */
export function NgPlusSlot() {
  const { t } = useTranslation('f-worlds');
  const label = useRuleLabel();
  const [meta, setMeta] = useState<ReturnType<typeof readMeta> | null>(null);
  useEffect(() => setMeta(readMeta()), []);
  if (!meta?.cleared) return null;
  const onNg = meta.slot === 'ngplus';
  return (
    <div className="mb-3 text-center">
      {onNg && <p className="mb-1 font-mono text-[10px] text-[#a89a7a]">{label(meta.rule)}</p>}
      <button
        onClick={() => {
          switchSlot(onNg ? 'main' : 'ngplus');
          window.location.reload();
        }}
        className="rounded border border-[#d4a054]/30 px-3 py-1.5 font-mono text-xs text-[#f0c674] hover:bg-[#d4a054]/10"
      >
        {onNg
          ? t('ng-to-classic', { defaultValue: 'Switch to classic save' })
          : t('ng-to-ngplus', { defaultValue: 'Switch to New Game+ save' })}
      </button>
    </div>
  );
}
