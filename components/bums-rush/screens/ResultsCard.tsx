'use client';

/**
 * What just happened, on a torn-out page.
 *
 * A document, not a viewport: it is a column you read top to bottom, so it uses
 * `.app-page` through the root (§12.1 rule 6). That matters more here than it
 * looks — this is the screen a player sees most often, and pinning it would
 * cost them the collapsing address bar on every single clear.
 *
 * Assists are reported, never scolded (§4.7). A run with assists on says so and
 * files itself on the assisted board; nothing here calls it a lesser clear.
 */

import { useTranslation } from 'react-i18next';
import { Check, Circle, RotateCcw, SkipForward } from 'lucide-react';
import type { Level, LevelResult } from '@/lib/bums-rush/types';
import { PaperCard, StickyNote } from '../paper/PaperSurface';
import { InkButton } from '../paper/InkControls';
import { formatClock, formatFraction } from '../format';
import { useNumberFormat } from '../hooks';
import { objectiveLabel } from './LevelCard';
import { ScreenFrame } from './ScreenFrame';

interface ResultsCardProps {
  result: LevelResult;
  level: Level | null;
  /** Null at the end of the campaign — the button is then not offered. */
  nextLevelId: string | null;
  previousBestMs: number | null;
  onRetry: () => void;
  onNext: (levelId: string) => void;
  onMap: () => void;
}

export function ResultsCard({
  result,
  level,
  nextLevelId,
  previousBestMs,
  onRetry,
  onNext,
  onMap,
}: ResultsCardProps) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const done = new Set(result.objectiveIds);
  const isBest = previousBestMs === null || result.durationMs < previousBestMs;

  return (
    <ScreenFrame
      title={t('results.title', { defaultValue: 'Cleared' })}
      subtitle={level ? t(level.name, { defaultValue: level.id }) : result.levelId}
      width="medium"
      onBack={onMap}
      backLabel={t('nav.back-map', { defaultValue: 'World map' })}
    >
      <div className="space-y-[clamp(0.75rem,2vmin,1.25rem)]">
        <PaperCard tilt={-0.8} taped className="p-[clamp(1rem,3vmin,2rem)]">
          <p className="text-xs tracking-wide text-bum-graphite uppercase">
            {t('results.time', { defaultValue: 'Time' })}
          </p>
          <p
            className="font-bold tabular-nums text-bum-ink"
            style={{ fontSize: 'clamp(2rem, 9vmin, 4rem)', lineHeight: 1 }}
          >
            {formatClock(result.durationMs, nf)}
          </p>
          {isBest ? (
            <p className="mt-2 inline-block bg-bum-highlight px-1 text-sm font-medium text-bum-ink">
              {t('results.personal-best', { defaultValue: 'Your best yet' })}
            </p>
          ) : previousBestMs !== null ? (
            <p className="mt-2 text-sm text-bum-graphite">
              {t('results.previous-best', {
                defaultValue: 'Your best: {{time}}',
                time: formatClock(previousBestMs, nf),
              })}
            </p>
          ) : null}

          <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-4">
            <div>
              <dt className="text-xs tracking-wide text-bum-graphite uppercase">
                {t('results.deaths', { defaultValue: 'Splats' })}
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-bum-ink">
                {nf.format(result.deaths)}
              </dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-bum-graphite uppercase">
                {t('results.players', { defaultValue: 'Players' })}
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-bum-ink">
                {nf.format(result.playerCount)}
              </dd>
            </div>
            {level ? (
              <div>
                <dt className="text-xs tracking-wide text-bum-graphite uppercase">
                  {t('results.objectives', { defaultValue: 'Objectives' })}
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-bum-ink">
                  {formatFraction(done.size, level.objectives.length, nf)}
                </dd>
              </div>
            ) : null}
          </dl>
        </PaperCard>

        {level && level.objectives.length > 0 ? (
          <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
            <ul className="space-y-2">
              {level.objectives.map((objective) => {
                const complete = done.has(objective.id);
                return (
                  <li key={objective.id} className="flex items-start gap-2">
                    {complete ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-bum-success" aria-hidden="true" />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-bum-graphite" aria-hidden="true" />
                    )}
                    <span className={complete ? 'text-sm text-bum-ink' : 'text-sm text-bum-graphite'}>
                      {objectiveLabel(objective, t)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </PaperCard>
        ) : null}

        {result.assisted ? (
          <StickyNote className="rotate-[0.6deg]">
            {t('results.assisted', {
              defaultValue:
                'Assists were on, so this run goes on the assisted board. Same clear, different column.',
            })}
          </StickyNote>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {nextLevelId ? (
            <InkButton variant="primary" size="lg" onClick={() => onNext(nextLevelId)}>
              <SkipForward className="size-4" aria-hidden="true" />
              {t('results.next', { defaultValue: 'Next level' })}
            </InkButton>
          ) : null}
          <InkButton onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('results.retry', { defaultValue: 'Again' })}
          </InkButton>
          <InkButton onClick={onMap}>{t('nav.back-map', { defaultValue: 'World map' })}</InkButton>
        </div>
      </div>
    </ScreenFrame>
  );
}
