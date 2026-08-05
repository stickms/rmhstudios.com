'use client';

/**
 * A category's runs, bucketed by game version.
 *
 * The bucketing is the design: a run set on `lo-1` and a run set on `lo-2` were
 * set in two different games, so the "all versions" view renders one ranked
 * section PER version with the version named at its head, rather than one merged
 * list whose top entry is whichever version happened to be easiest. Single
 * version selected → one section. Same component either way, so the label is
 * never detached from the runs it applies to
 * (`lib/speedrun/versions.ts` does the arithmetic and is shared with the server).
 *
 * Rows are `.glass-fill` — L1, no backdrop blur — because they repeat.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Clock, Film, Trophy } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { buildBoard, formatRunTime } from '@/lib/speedrun/versions';
import type { SpeedrunEntryView, SpeedrunMetric, VerificationTier } from '@/lib/speedrun/types';
import { VerificationBadge } from './VerificationBadge';

interface SpeedrunBoardProps {
  entries: SpeedrunEntryView[];
  metric: SpeedrunMetric;
  tier: VerificationTier;
  /** A version tag, or `all`. */
  version: string;
  /** Highlight the viewer's own runs. */
  viewerId?: string | null;
}

export function SpeedrunBoard({ entries, metric, tier, version, viewerId }: SpeedrunBoardProps) {
  const { t } = useTranslation('c-tournaments');
  const buckets = buildBoard(entries, metric, version);
  const ranked = buckets.reduce((total, bucket) => total + bucket.entries.length, 0);

  if (ranked === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title={t('speedrun-board-empty-title', { defaultValue: 'No verified runs yet' })}
        description={t('speedrun-board-empty-body', {
          defaultValue:
            'Record a replay in the game, then submit it here. First one on the board sets the record.',
        })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {buckets.map((bucket) => (
        <section key={bucket.version} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text-muted">
            {t('speedrun-version-heading', { defaultValue: 'Game version' })}
            <Badge variant="outline" size="sm">
              {bucket.version}
            </Badge>
          </h3>

          <ol className="flex flex-col gap-2">
            {bucket.entries.map((entry, index) => (
              <li
                key={entry.id}
                className={cn(
                  'glass-fill rounded-site px-3 py-2.5',
                  entry.runner.id === viewerId && 'ring-1 ring-site-accent',
                )}
              >
                {/* Wraps instead of scrolling: at 360px the stats drop to their
                    own line under the runner rather than pushing the page wide. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="w-7 shrink-0 text-center font-mono text-sm font-semibold text-site-text-muted tabular-nums">
                    {index + 1}
                  </span>

                  <Link
                    to="/u/$userid"
                    params={{ userid: entry.runner.handle ?? entry.runner.id }}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <UserAvatar
                      src={entry.runner.image}
                      alt=""
                      size={28}
                      fallbackName={entry.runner.name ?? undefined}
                    />
                    <span className="truncate text-sm font-medium text-site-text">
                      {entry.runner.name ??
                        t('speedrun-unknown-runner', { defaultValue: 'Unknown runner' })}
                    </span>
                  </Link>

                  <div className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-site-text">
                      <Clock className="size-3.5 text-site-text-dim" aria-hidden />
                      {formatRunTime(entry.timeMs)}
                    </span>
                    {metric === 'score' && entry.score !== null && (
                      <span className="font-mono text-sm tabular-nums text-site-text">
                        {entry.score}
                      </span>
                    )}
                    <VerificationBadge status={entry.status} tier={tier} />
                    <Link
                      to="/replays/$id"
                      params={{ id: entry.replayId }}
                      // 44px target: the row's one small control must still be
                      // tappable on a phone.
                      className="flex size-11 items-center justify-center rounded-site text-site-text-muted transition-colors hover:text-site-accent"
                      aria-label={t('speedrun-watch-replay', { defaultValue: 'Watch this run' })}
                    >
                      <Film className="size-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/**
 * The runs that are not on the board yet — queued or rejected — shown to their
 * owner. A queue you cannot see is indistinguishable from a run that vanished.
 */
export function SpeedrunQueue({
  entries,
  tier,
}: {
  entries: SpeedrunEntryView[];
  tier: VerificationTier;
}) {
  const { t } = useTranslation('c-tournaments');
  const unranked = entries.filter((e) => e.status !== 'verified');
  if (unranked.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-site-text-muted">
        {t('speedrun-queue-heading', { defaultValue: 'Not ranked yet' })}
      </h3>
      <ul className="flex flex-col gap-2">
        {unranked.map((entry) => (
          <li key={entry.id} className="glass-fill rounded-site px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1 truncate text-sm text-site-text">
                {entry.runner.name ??
                  t('speedrun-unknown-runner', { defaultValue: 'Unknown runner' })}
              </span>
              <span className="font-mono text-sm tabular-nums text-site-text-muted">
                {formatRunTime(entry.timeMs)}
              </span>
              <Badge variant="outline" size="sm">
                {entry.version}
              </Badge>
              <VerificationBadge status={entry.status} tier={tier} reason={entry.rejectReason} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
