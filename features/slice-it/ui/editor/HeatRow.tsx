/**
 * The miss heat row: a strip of buckets under the timeline, tinted by how often players miss that stretch of the
 * chart, for the chart's author.
 *
 * Four strengths by miss rate (`heatStep`), and never colour alone: each bucket carries its time range and its rate
 * as text (the readout under the strip on hover and focus, and the bucket's own label for a screen reader). A bucket
 * seeks the editor to its start. Nothing animates. The strip draws nothing under five sampled runs.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useArrival } from '@/components/ui/arrive';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { heatStep, MIN_SAMPLED_RUNS, ratePercent, type HeatStep } from '@features/slice-it/engine/miss-times';
import type { ChartMissesDto } from '@features/slice-it/engine/editor/api-schemas';
import { clockText } from '@features/slice-it/engine/editor/overview';
import { editorState } from '@features/slice-it/engine/editor/store';
import { useChartMisses } from './useChartMisses';

/** The tint of each step, in the editor's own `--slice-*` palette. Step 0 is a bucket nobody reached. */
export const HEAT_CLASS: Record<HeatStep, string> = {
  0: 'bg-slice-shadow-dark/20',
  1: 'bg-slice-accent/20',
  2: 'bg-slice-accent/40',
  3: 'bg-slice-accent/65',
  4: 'bg-slice-accent/90',
};

type Bucket = ChartMissesDto['buckets'][number];

export interface HeatRowViewProps {
  buckets: readonly Bucket[];
  /** The strip's name and, when nothing is hovered or focused, the line under it. Translated by the caller. */
  caption: string;
  /** One bucket's text: its time range and its rate. Translated by the caller. */
  bucketLabel: (bucket: Bucket) => string;
  /** A bucket was activated: seek to its start, in seconds. */
  onSeek?: (seconds: number) => void;
  /** The arrival fade, for a strip that replaces its skeleton (`useArrival`). */
  className?: string;
}

/** The strip itself: pure of data fetching, so it renders to static markup. */
export function HeatRowView({ buckets, caption, bucketLabel, onSeek, className }: HeatRowViewProps) {
  const [shown, setShown] = useState<number | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  // One tab stop for the strip (arrow keys move within it), on the first bucket anyone reached.
  const firstWithData = buckets.findIndex((bucket) => heatStep(bucket.rate) > 0);
  const tabStop = firstWithData === -1 ? 0 : firstWithData;

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    const next = groupRef.current?.querySelectorAll<HTMLButtonElement>('button')[index + delta];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <div className={cn('shrink-0 pt-1', className)}>
      <div ref={groupRef} role="group" aria-label={caption} className="flex h-5 gap-px" data-heat-row>
        {buckets.map((bucket, index) => {
          const step = heatStep(bucket.rate);
          const label = bucketLabel(bucket);
          return (
            <button
              key={bucket.from}
              type="button"
              data-heat={step}
              aria-label={label}
              title={label}
              tabIndex={index === tabStop ? 0 : -1}
              className={cn('min-w-0 flex-1 rounded-sm', HEAT_CLASS[step])}
              onPointerEnter={() => setShown(index)}
              onPointerLeave={() => setShown(null)}
              onFocus={() => setShown(index)}
              onBlur={() => setShown(null)}
              onKeyDown={(event) => move(event, index)}
              onClick={() => onSeek?.(bucket.from)}
            />
          );
        })}
      </div>
      <p className="mt-1 truncate text-[11px] tabular-nums text-slice-text-muted" aria-live="off">
        {shown !== null && buckets[shown] ? bucketLabel(buckets[shown]) : caption}
      </p>
    </div>
  );
}

/** The heat row for the open difficulty: the strip once there are enough sampled runs, else nothing. */
export function HeatRow() {
  const { t } = useTranslation('chart-misses');
  const misses = useChartMisses();
  // The strip replaces a skeleton when the read lands: it fades in (M9).
  const arrival = useArrival(!misses.isPending);

  if (misses.isPending) {
    // `isPending` is also true for a difficulty with no chart row (the query is off): nothing to wait for then.
    return misses.fetchStatus === 'idle' ? null : <Skeleton className="mt-1 h-5 w-full" />;
  }
  if (misses.isError) {
    return (
      <p className="mt-1 text-[11px] text-slice-text-muted">
        {t('heat-unavailable', { defaultValue: 'Where players miss is not available right now' })}
      </p>
    );
  }
  const data = misses.data;
  if (!data || data.sampledRuns < MIN_SAMPLED_RUNS || data.buckets.length === 0) return null;

  return (
    <HeatRowView
      className={arrival}
      buckets={data.buckets}
      caption={t('heat-caption', {
        runs: data.sampledRuns,
        defaultValue: 'Where players miss, based on {{runs}} sampled runs',
      })}
      bucketLabel={(bucket) =>
        bucket.rate === null
          ? t('heat-bucket-empty', {
              from: clockText(bucket.from),
              to: clockText(bucket.to),
              defaultValue: '{{from}} to {{to}}: no data',
            })
          : t('heat-bucket', {
              from: clockText(bucket.from),
              to: clockText(bucket.to),
              percent: ratePercent(bucket.rate),
              defaultValue: '{{from}} to {{to}}: {{percent}}% missed',
            })
      }
      onSeek={(seconds) => editorState().setPlayhead(seconds)}
    />
  );
}
