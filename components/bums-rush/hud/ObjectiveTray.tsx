'use client';

/**
 * The three optional objectives, and which of them you have already done.
 *
 * React-driven, not ref-driven: an objective completes a handful of times per
 * level, so this is exactly the kind of state a render is for. The highlighter
 * swipe is a `scaleX` on a full-width fill behind the text — a transform, not
 * an animated `width`, so it composites instead of relaying out the tray.
 *
 * It collapses to a count on short viewports. A landscape phone is ~390 CSS px
 * tall; three lines of objective text plus the seat bar plus the clock is more
 * chrome than playfield, so below `sm` the tray is a button that opens the list
 * rather than the list itself.
 */

import { useTranslation } from 'react-i18next';
import { ListChecks } from 'lucide-react';
import type { Objective } from '@/lib/bums-rush/types';
import { cn } from '@/lib/utils';
import { objectiveLabel } from '../screens/LevelCard';
import { formatFraction } from '../format';
import { useNumberFormat } from '../hooks';

interface ObjectiveTrayProps {
  objectives: readonly Objective[];
  completed: readonly string[];
  /** Pinned open by the `objectives` action, or by tapping the count. */
  open: boolean;
  onToggle: () => void;
}

export function ObjectiveTray({ objectives, completed, open, onToggle }: ObjectiveTrayProps) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const done = new Set(completed);

  if (objectives.length === 0) return null;

  return (
    <div className="pointer-events-auto flex max-w-[min(20rem,60vw)] flex-col items-end gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-bum border border-bum-ink bg-bum-surface px-2 py-1 text-bum-ink transition-colors hover:bg-bum-paper-2"
        style={{ fontSize: 'clamp(0.65rem, 1.6vmin, 0.85rem)' }}
      >
        <ListChecks className="size-[clamp(0.75rem,2vmin,1rem)]" aria-hidden="true" />
        <span className="tabular-nums">{formatFraction(done.size, objectives.length, nf)}</span>
        <span className="sr-only">{t('hud.objectives', { defaultValue: 'Objectives' })}</span>
      </button>

      {open ? (
        <ul className="w-full space-y-1">
          {objectives.map((objective) => {
            const complete = done.has(objective.id);
            return (
              <li
                key={objective.id}
                className="relative overflow-hidden rounded-bum-sm border border-bum-ink bg-bum-surface px-2 py-1"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-0 origin-left bg-bum-highlight transition-transform duration-300 ease-out',
                    'motion-reduce:transition-none',
                  )}
                  style={{ transform: complete ? 'scaleX(1)' : 'scaleX(0)' }}
                />
                <span
                  className="relative text-bum-ink"
                  style={{ fontSize: 'clamp(0.65rem, 1.5vmin, 0.8rem)' }}
                >
                  {objectiveLabel(objective, t)}
                </span>
                {complete ? (
                  <span className="sr-only">{t('hud.objective-done', { defaultValue: 'Done' })}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
