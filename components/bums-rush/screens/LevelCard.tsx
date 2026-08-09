'use client';

/**
 * One level, before you play it: what it is, what it wants, and what you have
 * already done to it.
 *
 * The level is fetched here rather than at the moment Play is pressed, so a
 * level that fails to parse fails on a page with a way back instead of on a
 * black screen with a spinner (§8 of the brief: honest degradation). The same
 * fetch warms `loader.ts`'s cache, so pressing Play does not re-download it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Clock, Package, PersonStanding, Sparkles, Utensils, type LucideIcon } from 'lucide-react';
import { loadLevel } from '@/lib/bums-rush/levels';
import type { Level, Objective, ObjectiveKind, Profile } from '@/lib/bums-rush/types';
import { PaperCard, StickyNote } from '../paper/PaperSurface';
import { InkButton } from '../paper/InkControls';
import { formatClock } from '../format';
import { useNumberFormat } from '../hooks';
import { ScreenFrame } from './ScreenFrame';

interface LevelCardProps {
  levelId: string;
  profile: Profile;
  onPlay: (levelId: string) => void;
  onBack: () => void;
}

/** The best time recorded for this level at ANY player count, or null. */
export function bestTimeFor(profile: Profile, levelId: string): number | null {
  let best: number | null = null;
  for (const clear of Object.values(profile.clears)) {
    if (clear.levelId !== levelId) continue;
    if (best === null || clear.bestMs < best) best = clear.bestMs;
  }
  return best;
}

const OBJECTIVE_ICONS: Record<ObjectiveKind, LucideIcon> = {
  clock: Clock,
  haul: Package,
  pose: PersonStanding,
  snapshot: Camera,
  recipe: Utensils,
  flawless: Sparkles,
};

export function LevelCard({ levelId, profile, onPlay, onBack }: LevelCardProps) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const [level, setLevel] = useState<Level | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLevel(null);
    setFailed(false);
    // `loadLevel` throws synchronously on a malformed id and rejects on a bad
    // file, so both paths land in the same card.
    Promise.resolve()
      .then(() => loadLevel(levelId))
      .then((loaded) => {
        if (!cancelled) setLevel(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [levelId]);

  const best = useMemo(() => bestTimeFor(profile, levelId), [profile, levelId]);
  const name = level ? t(level.name, { defaultValue: '' }) : '';
  const title =
    name || t('level.fallback-name', { defaultValue: 'Level {{id}}', id: levelId });

  return (
    <ScreenFrame
      title={title}
      width="medium"
      onBack={onBack}
      backLabel={t('nav.back-map', { defaultValue: 'World map' })}
    >
      {failed ? (
        <PaperCard className="p-[clamp(1rem,3vmin,2rem)]">
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('level.failed-title', { defaultValue: 'This one is torn' })}
          </h2>
          <p className="mt-2 text-sm text-bum-graphite">
            {t('level.failed-body', {
              defaultValue:
                'The level file would not load. Nothing you did — pick another one and we will look into this.',
            })}
          </p>
          <InkButton className="mt-4" onClick={onBack}>
            {t('nav.back-map', { defaultValue: 'World map' })}
          </InkButton>
        </PaperCard>
      ) : null}

      {!level && !failed ? (
        <p className="text-sm text-bum-graphite" role="status">
          {t('level.loading', { defaultValue: 'Finding the page…' })}
        </p>
      ) : null}

      {level ? (
        <div className="space-y-[clamp(0.75rem,2vmin,1.25rem)]">
          <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-4">
              <Stat
                label={t('level.par', { defaultValue: 'Par time' })}
                value={formatClock(level.parSeconds * 1000, nf)}
              />
              <Stat
                label={t('level.players', { defaultValue: 'Players' })}
                value={
                  level.minPlayers === level.maxPlayers
                    ? nf.format(level.minPlayers)
                    : `${nf.format(level.minPlayers)}–${nf.format(level.maxPlayers)}`
                }
              />
              <Stat
                label={t('level.best', { defaultValue: 'Your best' })}
                value={best === null ? t('level.best-none', { defaultValue: '—' }) : formatClock(best, nf)}
              />
            </dl>
          </PaperCard>

          <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
            <h2 className="text-lg font-semibold text-bum-ink">
              {t('level.objectives', { defaultValue: 'Optional objectives' })}
            </h2>
            <p className="mt-1 text-sm text-bum-graphite">
              {t('level.objectives-blurb', {
                defaultValue: 'None of these gate anything. The level ends when you reach the goal.',
              })}
            </p>
            <ul className="mt-3 space-y-2">
              {level.objectives.map((objective) => (
                <li key={objective.id} className="flex items-start gap-2">
                  <ObjectiveIcon kind={objective.kind} />
                  <span className="text-sm text-bum-ink">{objectiveLabel(objective, t)}</span>
                </li>
              ))}
            </ul>
          </PaperCard>

          {level.minPlayers > 1 ? (
            <StickyNote tone="highlight" className="rotate-[-0.8deg]">
              {t('level.needs-two-note', {
                defaultValue:
                  'This one needs two pairs of hands. Start it anyway and anyone who joins drops straight in.',
              })}
            </StickyNote>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <InkButton variant="primary" size="lg" onClick={() => onPlay(level.id)}>
              {t('level.play', { defaultValue: 'Play it' })}
            </InkButton>
          </div>
        </div>
      ) : null}
    </ScreenFrame>
  );
}

function ObjectiveIcon({ kind }: { kind: ObjectiveKind }) {
  const Icon = OBJECTIVE_ICONS[kind];
  return <Icon className="mt-0.5 size-4 shrink-0 text-bum-graphite" aria-hidden="true" />;
}

type Translate = (key: string, options: Record<string, unknown>) => string;

/**
 * Objective copy by kind. The parameterised ones name their target so the tray
 * in-game and this card say the same thing; the ids themselves never reach the
 * player, since they are authoring handles, not language.
 */
export function objectiveLabel(objective: Objective, t: Translate): string {
  switch (objective.kind) {
    case 'clock':
      return t('objective.clock', { defaultValue: 'Finish inside par time' });
    case 'haul':
      return t('objective.haul', {
        defaultValue: 'Carry every relic to the goal',
        count: objective.relicIds.length,
      });
    case 'pose':
      return t('objective.pose', { defaultValue: 'Strike the drawn pose' });
    case 'snapshot':
      return t('objective.snapshot', { defaultValue: 'Take the photo the level is asking for' });
    case 'recipe':
      return t('objective.recipe', { defaultValue: 'Plate the recipe' });
    case 'flawless':
      return t('objective.flawless', { defaultValue: 'Clear it without dying once' });
    default:
      return t('objective.unknown', { defaultValue: 'Hidden objective' });
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-bum-graphite uppercase">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-bum-ink">{value}</dd>
    </div>
  );
}
