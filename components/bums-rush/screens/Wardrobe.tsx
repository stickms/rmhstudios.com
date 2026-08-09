'use client';

/**
 * The Scrapbook (§11.3): what you are wearing, what you have earned, and what
 * is still out there.
 *
 * DOM, not canvas, and deliberately so — this is the screen that has to be
 * readable at 200% browser zoom, selectable, translated and reachable by a
 * screen reader. Painting it into the drawing would look better and be worth
 * less.
 *
 * Unfound things are shown as dotted outlines: visible progress, no location
 * hints. A player can see there are forty parcels and how many they have
 * without the game spoiling where any of them are.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import {
  GLOVES_IDS,
  HAT_IDS,
  HEAD_IDS,
  INK_IDS,
  type CosmeticId,
  type CosmeticSlot,
} from '@/lib/bums-rush/cosmetics';
import {
  CAMPAIGN_LEVEL_COUNT,
  CAMPAIGN_OBJECTIVE_COUNT,
  PARCEL_TOTAL,
  progressFromProfile,
} from '@/lib/bums-rush/progress/unlocks';
import type { Cosmetics, Profile } from '@/lib/bums-rush/types';
import { cn } from '@/lib/utils';
import { PaperCard, Tape } from '../paper/PaperSurface';
import { formatFraction, humaniseId } from '../format';
import { useNumberFormat } from '../hooks';
import { ScreenFrame } from './ScreenFrame';

interface WardrobeProps {
  profile: Profile;
  onEquip: (patch: Partial<Cosmetics>) => void;
  onBack: () => void;
}

const SLOTS: readonly { slot: CosmeticSlot; ids: readonly CosmeticId[] }[] = [
  { slot: 'head', ids: HEAD_IDS },
  { slot: 'hat', ids: HAT_IDS },
  { slot: 'gloves', ids: GLOVES_IDS },
  { slot: 'ink', ids: INK_IDS },
];

export function Wardrobe({ profile, onEquip, onBack }: WardrobeProps) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const unlocked = useMemo(() => new Set(profile.unlockedCosmetics), [profile.unlockedCosmetics]);
  const progress = useMemo(() => progressFromProfile(profile), [profile]);
  // `UnlockProgress` carries the per-level objective BITMASKS, not a total —
  // the union across player counts is the interesting number, and summing the
  // set bits is the only place that total is wanted.
  const objectivesComplete = useMemo(() => {
    let total = 0;
    for (const mask of progress.clearedLevels.values()) total += popcount(mask);
    return total;
  }, [progress]);

  const slotLabels: Record<CosmeticSlot, string> = {
    head: t('wardrobe.head', { defaultValue: 'Heads' }),
    hat: t('wardrobe.hat', { defaultValue: 'Hats' }),
    gloves: t('wardrobe.gloves', { defaultValue: 'Gloves' }),
    ink: t('wardrobe.ink', { defaultValue: 'Ink' }),
  };

  return (
    <ScreenFrame
      title={t('wardrobe.title', { defaultValue: 'Scrapbook' })}
      subtitle={t('wardrobe.sub', {
        defaultValue: 'Everything here is earned. Nothing is for sale and nothing expires.',
      })}
      width="wide"
      onBack={onBack}
      backLabel={t('nav.back', { defaultValue: 'Back' })}
    >
      <div className="space-y-[clamp(0.75rem,2vmin,1.25rem)]">
        <PaperCard className="relative p-[clamp(0.875rem,2.5vmin,1.5rem)]">
          <Tape className="-top-2 left-8" />
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-4">
            <Stat
              label={t('wardrobe.levels', { defaultValue: 'Levels cleared' })}
              value={formatFraction(progress.levelsCleared, CAMPAIGN_LEVEL_COUNT, nf)}
            />
            <Stat
              label={t('wardrobe.objectives', { defaultValue: 'Objectives' })}
              value={formatFraction(objectivesComplete, CAMPAIGN_OBJECTIVE_COUNT, nf)}
            />
            <Stat
              label={t('wardrobe.parcels', { defaultValue: 'Parcels' })}
              value={formatFraction(progress.parcelsFound.length, PARCEL_TOTAL, nf)}
            />
            <Stat
              label={t('wardrobe.deaths', { defaultValue: 'Splats' })}
              value={nf.format(profile.deaths)}
            />
          </dl>
        </PaperCard>

        {SLOTS.map(({ slot, ids }) => (
          <section key={slot} aria-labelledby={`bums-slot-${slot}`}>
            <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`bums-slot-${slot}`} className="text-lg font-semibold text-bum-ink">
                  {slotLabels[slot]}
                </h2>
                <p className="text-sm text-bum-graphite">
                  {formatFraction(ids.filter((id) => unlocked.has(id)).length, ids.length, nf)}
                </p>
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,6.5rem),1fr))] gap-2">
                {ids.map((id) => {
                  const owned = unlocked.has(id);
                  const equipped = profile.cosmetics[slot] === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        disabled={!owned}
                        aria-pressed={equipped}
                        onClick={() => onEquip({ [slot]: id } as Partial<Cosmetics>)}
                        className={cn(
                          'flex h-full w-full flex-col items-start gap-1 rounded-bum border-2 p-2 text-left transition-colors',
                          owned
                            ? 'border-bum-ink bg-bum-surface hover:bg-bum-paper-2'
                            : 'border-dashed border-bum-graphite bg-transparent',
                          equipped && 'bg-bum-highlight',
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-1">
                          <span
                            className={cn(
                              'text-sm font-medium',
                              owned ? 'text-bum-ink' : 'text-bum-graphite',
                            )}
                          >
                            {t(`cosmetic.${id}`, { defaultValue: humaniseId(id) })}
                          </span>
                          {!owned ? (
                            <Lock
                              className="size-3.5 shrink-0 text-bum-graphite"
                              aria-label={t('wardrobe.locked', { defaultValue: 'Locked' })}
                            />
                          ) : null}
                        </span>
                        {equipped ? (
                          <span className="text-xs text-bum-graphite">
                            {t('wardrobe.equipped', { defaultValue: 'Worn' })}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PaperCard>
          </section>
        ))}
      </div>
    </ScreenFrame>
  );
}

/** Set bits in an objective mask — three per level, so the loop is trivially short. */
function popcount(value: number): number {
  let count = 0;
  let bits = value;
  while (bits !== 0) {
    bits &= bits - 1;
    count++;
  }
  return count;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-bum-graphite uppercase">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-bum-ink">{value}</dd>
    </div>
  );
}
