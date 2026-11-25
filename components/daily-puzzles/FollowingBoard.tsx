import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { Tabs } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { formatDuration } from '@/lib/globeset/game';
import { cn } from '@/lib/utils';
import type { FollowingBoardEntry, FollowingSummaryMode } from '@/lib/daily-puzzles/following.contract';

export type BoardTab = 'everyone' | 'friends';

/** The strip under a board's heading: everyone, or the viewer's friends. Shown to signed-in members only. */
export function BoardTabs({ value, onChange }: { value: BoardTab; onChange: (tab: BoardTab) => void }) {
  const { t } = useTranslation('daily-following');
  return (
    <Tabs
      tabs={[
        { id: 'everyone', label: t('tab-everyone', { defaultValue: 'Everyone' }) },
        { id: 'friends', label: t('tab-friends', { defaultValue: 'Friends' }) },
      ]}
      value={value}
      onChange={(id) => onChange(id as BoardTab)}
      size="sm"
      aria-label={t('tabs-label', { defaultValue: 'Whose results' })}
    />
  );
}

/** The figures a result is written from. */
interface Result {
  score: number | null;
  moves: number | null;
  dnf: boolean;
  timeSeconds: number | null;
}

/**
 * A result in words and numbers, by the mode's own axis: moves for Lights Out, time for GlobeSet, points for the
 * rest. A run that did not finish reads "DNF". Text only, so a row names the result without colour or icon.
 */
export function resultText(t: TFunction<'daily-following'>, gameMode: string, r: Result): string {
  if (gameMode === 'lights-out') {
    if (r.dnf || r.moves == null) return t('result-dnf', { defaultValue: 'DNF' });
    return t('result-moves', { count: r.moves, defaultValue_one: '{{count}} move', defaultValue: '{{count}} moves' });
  }
  if (gameMode === 'globeset') {
    if (r.dnf || r.timeSeconds == null) return t('result-dnf', { defaultValue: 'DNF' });
    return formatDuration(r.timeSeconds);
  }
  return t('result-points', { count: r.score ?? 0, defaultValue_one: '{{count}} pt', defaultValue: '{{count}} pts' });
}

interface FollowingBoardListProps {
  gameMode: string;
  entries: FollowingBoardEntry[] | undefined;
  loading: boolean;
  failed: boolean;
}

/** The friends board under a result: the viewer and their mutual follows, ranked, or the reason it is empty. */
export function FollowingBoardList({ gameMode, entries, loading, failed }: FollowingBoardListProps) {
  const { t } = useTranslation('daily-following');
  const arrival = useArrival(!loading);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size={24} />
      </div>
    );
  }
  if (failed) {
    return (
      <p role="alert" className={cn('py-3 text-center text-sm text-site-text-muted', arrival)}>
        {t('load-failed', { defaultValue: "Could not load your friends' results. Try again in a moment." })}
      </p>
    );
  }

  const rows = entries ?? [];
  // Only the viewer on the board means no friend has a score yet.
  const alone = rows.every((e) => e.isYou);

  return (
    <div className={cn('flex flex-col gap-2', arrival)}>
      {rows.length > 0 && (
        <ol className="flex flex-col gap-2">
          {rows.map((e) => (
            <li
              key={e.rank}
              className="flex items-center justify-between gap-3 rounded-site-sm bg-site-bg-subtle px-3 py-2"
            >
              <span className="w-8 shrink-0 font-mono text-sm text-site-text-muted">#{e.rank}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-site-text">
                <bdi>{e.displayName}</bdi>
                {e.isYou && (
                  <span className="ms-2 text-xs font-normal text-site-text-muted">
                    {t('you', { defaultValue: 'You' })}
                  </span>
                )}
              </span>
              <span className={cn('font-mono font-semibold', e.dnf ? 'text-site-danger' : 'text-site-text')}>
                {resultText(t, gameMode, e)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {alone && (
        <p className="py-3 text-center text-sm text-site-text-muted">
          {rows.length === 0
            ? t('empty-none', { defaultValue: 'No friends have finished this puzzle yet.' })
            : t('empty-only-you', { defaultValue: 'None of your friends have finished this puzzle yet.' })}{' '}
          {t('empty-explain', { defaultValue: 'Friends are people you follow who follow you back.' })}{' '}
          <Link to="/follows" className="underline">
            {t('empty-link', { defaultValue: 'See who you follow' })}
          </Link>
        </p>
      )}
    </div>
  );
}

/** One hub line for a mode: how many friends finished, the best of them and the viewer's own result. */
export function FollowingSummaryLine({ summary, id }: { summary: FollowingSummaryMode; id?: string }) {
  const { t } = useTranslation('daily-following');
  const { gameMode, finished, best, you } = summary;
  return (
    <span id={id} className="flex flex-col gap-0.5 text-xs text-site-text-muted">
      <span>
        {finished > 0
          ? t('summary-finished', {
              count: finished,
              defaultValue_one: '{{count}} friend finished',
              defaultValue: '{{count}} friends finished',
            })
          : t('summary-none', { defaultValue: 'No friends have finished yet' })}
        {best && (
          <>
            {' · '}
            {t('summary-best', { defaultValue: 'Best' })} <bdi>{best.displayName}</bdi>{' '}
            {resultText(t, gameMode, { ...best, dnf: false })}
          </>
        )}
      </span>
      {you && (
        <span>
          {t('summary-you', { defaultValue: 'You' })} {resultText(t, gameMode, you)}
        </span>
      )}
    </span>
  );
}
