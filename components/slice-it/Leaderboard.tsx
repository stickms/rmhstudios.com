'use client';

import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Bomb,
  Crosshair,
  Flame,
  Ghost,
  HeartPulse,
  Layers,
  PlayCircle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { ReplayViewer } from './ReplayViewer';
import { RivalPanel } from './ai/RivalPanel';
import { DIFFICULTIES, type Difficulty } from '@/lib/slice-it/constants';
import { MOD_POOLS, type ModPool } from '@/lib/slice-it/pools';
import type { LeaderboardEntry } from '@/lib/slice-it/types';

/**
 * The song / global leaderboard panel.
 *
 * ## It was reading a response that no longer existed
 *
 * `fetch(...)` → `if (Array.isArray(data)) setLeaderboard(data)`. The route has
 * returned `{ entries, total, nextCursor, self }` since it grew pagination, so
 * `Array.isArray` was false on every successful request and this panel rendered
 * "No scores yet" **for every song, permanently** — including songs with a full
 * board. Nothing threw and nothing logged, and an empty leaderboard is a
 * plausible thing to see, which is why it survived.
 *
 * ## Boards, not a board (R1)
 *
 * A song has one board per `(difficulty, modPool)` now — see the note on
 * `SongLeaderboard` in the schema for why one row per player per song was a
 * correctness bug rather than merely a coarse ranking. Both pickers default to
 * "all", which is the merged view this panel has always shown; choosing a tier
 * is what makes the numbers in it comparable to each other.
 *
 * ## Every row is a link (X11)
 *
 * Usernames were plain, unlinked text, so "who is this person who beat me, and
 * what else do they play?" — the most natural social action in the game — was a
 * dead end. A row links when the account has a handle and renders unlinked when
 * it does not, which is also how a viewer tells a guest (`X10`) from a member.
 */

/**
 * ## The global board ranks skill, not volume (R2)
 *
 * It used to be `ORDER BY "totalScore" DESC` — the sum of every score the
 * account had ever submitted — so it ranked **how much you had played**: an
 * account grinding an easy chart outranked a better player who did not. The
 * number in the score column of that board is now the skill rating: best per
 * *ranked* chart, weighted by the chart's computed difficulty (`C3`) and by
 * accuracy, decayed so the top ~50 dominate. Lifetime total is still shown, as
 * the statistic it always was rather than as the ranking.
 */

/**
 * A global-board row, which carries three fields a song row does not.
 *
 * Optional, because one component renders both boards out of one piece of
 * state, and because a client deployed against an older server does not receive
 * them — in which case the extra chips do not render and the row is exactly what
 * it was.
 */
type BoardEntry = LeaderboardEntry & {
  skillRating?: number;
  totalScore?: number;
  rankedPlays?: number;
};

interface LeaderboardResponse {
  entries?: BoardEntry[];
  total?: number;
  self?: BoardEntry | null;
  scopeUnavailable?: 'signed-out' | 'no-location';
}

type Scope = 'global' | 'friends' | 'country';
type TimeWindow = 'all' | 'month' | 'week';

interface LeaderboardProps {
  songId?: string | null;
}

export const Leaderboard = memo(function Leaderboard({ songId }: LeaderboardProps) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [self, setSelf] = useState<BoardEntry | null>(null);
  const [unavailable, setUnavailable] = useState<LeaderboardResponse['scopeUnavailable']>();
  const [isLoading, setIsLoading] = useState(false);

  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [modPool, setModPool] = useState<ModPool | 'all'>('all');
  const [scope, setScope] = useState<Scope>('global');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');

  /**
   * `userId → GameReplay.id` for the rows currently on screen (`R4`).
   *
   * Fetched in one request after the board loads rather than joined into the
   * leaderboard response: `LeaderboardEntry` is the contract the multiplayer
   * sidebar and the results screen also read, and a replay is a property of a
   * *run artefact*, not of a rank. Rows without one simply do not get a button.
   */
  const [replays, setReplays] = useState<Record<string, string>>({});
  const [watching, setWatching] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (songId) params.set('songId', songId);
        // The filters only mean anything on a song board — the global board is
        // one list of skill ratings with no tier and no modifiers, because a
        // skill rating is already an aggregate across every tier and pool.
        if (songId && difficulty !== 'all') params.set('difficulty', difficulty);
        if (songId && modPool !== 'all') params.set('modPool', modPool);
        if (songId && scope !== 'global') params.set('scope', scope);
        if (songId && timeWindow !== 'all') params.set('window', timeWindow);

        const res = await fetch(`/api/slice-it/leaderboard?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as LeaderboardResponse;
        setEntries(Array.isArray(data.entries) ? data.entries : []);
        setSelf(data.self ?? null);
        setUnavailable(data.scopeUnavailable);
      } catch (err) {
        // An abort is this effect cleaning up after a filter change, not a
        // failure — logging it would put a console error on every selection.
        if ((err as { name?: string })?.name === 'AbortError') return;
        console.error('Failed to load leaderboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [songId, difficulty, modPool, scope, timeWindow]);

  // Which of the visible players have a replay stored on this song. Keyed off
  // the ids actually rendered, so switching tier or page re-asks for exactly the
  // rows on screen and nothing else.
  const shownIds = [...entries.map((entry) => entry.userId), ...(self ? [self.userId] : [])].join(
    ',',
  );

  useEffect(() => {
    if (!songId || !shownIds) {
      setReplays({});
      return;
    }
    const controller = new AbortController();

    const load = async () => {
      try {
        const params = new URLSearchParams({ songId, userIds: shownIds });
        const res = await fetch(`/api/slice-it/replay?${params}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { replays?: Record<string, string> };
        setReplays(data.replays ?? {});
      } catch {
        // A board without watch buttons is a board. This lookup is decoration on
        // a list that has already rendered, and it never gets to log an error
        // over it.
      }
    };

    void load();
    return () => controller.abort();
  }, [songId, shownIds]);

  // Only draw the self row when it is not already on screen; otherwise the
  // player sees themselves twice, with two different rank numbers.
  const showSelf = self && !entries.some((entry) => entry.isSelf);

  return (
    <div className="space-y-2 flex-1 overflow-auto flex flex-col min-h-0">
      <label className="text-xs text-slice-text-light uppercase tracking-widest font-bold flex items-center gap-2 shrink-0">
        <span
          className={`w-2 h-2 rounded-full ${songId ? 'bg-blue-500' : 'bg-yellow-400'} animate-pulse`}
        />
        {songId
          ? t('song-leaderboard', { defaultValue: 'Song Leaderboard' })
          : t('global-leaderboard', { defaultValue: 'Global Leaderboard' })}
      </label>

      {!songId && (
        // Said once, at the top, rather than in a tooltip on every row: the
        // number in this column changed meaning, and a player who read it as a
        // lifetime total last week will otherwise read it as one this week.
        <p className="text-[11px] text-slice-text-light leading-relaxed shrink-0">
          {ts('board-skill-explainer', {
            defaultValue:
              'Ranked by skill rating: your best run on each ranked chart, weighted by how hard the chart is and how accurately you played it. Playing more does not raise it — playing better does.',
          })}
        </p>
      )}

      {songId && (
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <FilterSelect
            label={ts('board-difficulty', { defaultValue: 'Difficulty' })}
            value={difficulty}
            onChange={(value) => setDifficulty(value as Difficulty | 'all')}
            options={[
              { value: 'all', label: ts('board-all-difficulties', { defaultValue: 'All tiers' }) },
              ...DIFFICULTIES.map((value) => ({ value, label: value })),
            ]}
          />
          <FilterSelect
            label={ts('board-mods', { defaultValue: 'Mods' })}
            value={modPool}
            onChange={(value) => setModPool(value as ModPool | 'all')}
            options={[
              { value: 'all', label: ts('board-all-mods', { defaultValue: 'All mods' }) },
              ...MOD_POOLS.map((value) => ({ value, label: value })),
            ]}
          />
          <FilterSelect
            label={ts('board-scope', { defaultValue: 'Who' })}
            value={scope}
            onChange={(value) => setScope(value as Scope)}
            options={[
              { value: 'global', label: ts('board-scope-global', { defaultValue: 'Everyone' }) },
              { value: 'friends', label: ts('board-scope-friends', { defaultValue: 'Following' }) },
              { value: 'country', label: ts('board-scope-country', { defaultValue: 'My area' }) },
            ]}
          />
          <FilterSelect
            label={ts('board-window', { defaultValue: 'When' })}
            value={timeWindow}
            onChange={(value) => setTimeWindow(value as TimeWindow)}
            options={[
              { value: 'all', label: ts('board-window-all', { defaultValue: 'All time' }) },
              { value: 'month', label: ts('board-window-month', { defaultValue: 'This month' }) },
              { value: 'week', label: ts('board-window-week', { defaultValue: 'This week' }) },
            ]}
          />
        </div>
      )}

      <div className="bg-slice-bg rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] px-3 pb-3 pt-4 text-xs space-y-1 overflow-y-auto custom-scrollbar flex-1 min-h-[200px]">
        {isLoading ? (
          <div className="text-slice-text-light text-center py-4">
            {t('loading', { defaultValue: 'Loading...' })}
          </div>
        ) : unavailable ? (
          <div className="text-slice-text-light text-center py-4 px-2 leading-relaxed">
            {unavailable === 'signed-out'
              ? ts('board-scope-signed-out', {
                  defaultValue: 'Sign in to see how you compare to people you follow.',
                })
              : ts('board-scope-no-location', {
                  defaultValue: 'Add a location to your profile to see a board for your area.',
                })}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-slice-text-light text-center py-4">
            {t('no-scores-yet', { defaultValue: 'No scores yet' })}
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <Row
                key={`${entry.userId}-${entry.rank}`}
                entry={entry}
                replayId={replays[entry.userId]}
                onWatch={setWatching}
              />
            ))}
            {showSelf && (
              <>
                <div className="h-px bg-slice-shadow-dark/40 my-1" role="presentation" />
                <Row entry={self} replayId={replays[self.userId]} onWatch={setWatching} />
              </>
            )}
          </>
        )}
      </div>

      {/*
        Only on a song board, only when the caller is on it, and only when there
        is a row above them to catch. Rank 1 has nobody to chase, and the global
        board ranks a skill rating across charts rather than one run — there is
        no "their loadout versus yours" to analyse there.
      */}
      {songId && self && self.rank > 1 ? (
        <RivalPanel
          songId={songId}
          rivalRank={self.rank - 1}
          // Only when the board is narrowed to one: 'all' is the combined view,
          // and the server ranks it the same way by receiving neither filter.
          {...(difficulty !== 'all' ? { difficulty } : {})}
          {...(modPool !== 'all' ? { modPool } : {})}
        />
      ) : null}

      <DialogPrimitive.Root
        open={watching !== null}
        onOpenChange={(open) => !open && setWatching(null)}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-100 bg-black/50 backdrop-blur-sm" />
          <DialogPrimitive.Content className="slice-theme bg-slice-bg fixed left-1/2 top-1/2 z-100 w-[min(48rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl">
            <DialogPrimitive.Title className="sr-only">
              {ts('replay-title', { defaultValue: 'Replay' })}
            </DialogPrimitive.Title>
            {watching && <ReplayViewer replayId={watching} onClose={() => setWatching(null)} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
});

/**
 * A board filter.
 *
 * A native `<select>` deliberately. This panel is a fixed-width column inside
 * the game shell, four of these have to fit above a 200px-tall list, and the
 * platform's own picker is the only control that survives that while staying
 * keyboard- and screen-reader-correct with no work.
 */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex-1 min-w-[6.5rem]">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg bg-slice-bg px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slice-text-light shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Row({
  entry,
  replayId,
  onWatch,
}: {
  entry: BoardEntry;
  /** Present only when this run has a stored input log (`R3`). */
  replayId?: string;
  onWatch?: (replayId: string) => void;
}) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const rank = entry.rank;

  return (
    <div
      className={`flex items-center gap-2 p-2 hover:bg-slice-shadow-dark/50 rounded border-b border-slice-shadow-dark/30 last:border-0
        ${
          rank === 1
            ? 'ring-2 ring-yellow-400 ring-inset shadow-[inset_0_0_8px_rgba(250,204,21,0.2)]'
            : rank === 2
              ? 'ring-2 ring-zinc-300 ring-inset shadow-[inset_0_0_8px_rgba(212,212,216,0.2)]'
              : rank === 3
                ? 'ring-2 ring-amber-600 ring-inset shadow-[inset_0_0_8px_rgba(180,83,9,0.2)]'
                : ''
        }
        ${entry.isSelf ? 'bg-blue-500/10' : ''}
      `}
    >
      <span className="text-slice-text-light w-5 text-center font-bold shrink-0">{rank}.</span>

      <PlayerName entry={entry} />

      {replayId && onWatch && (
        <Tooltip content={ts('replay-watch', { defaultValue: 'Watch this run' })}>
          <button
            type="button"
            onClick={() => onWatch(replayId)}
            className="text-slice-text-light hover:text-blue-500 shrink-0"
            aria-label={ts('replay-watch-of', {
              defaultValue: "Watch {{name}}'s run",
              name: entry.username,
            })}
          >
            <PlayCircle className="h-4 w-4" />
          </button>
        </Tooltip>
      )}

      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <div className="flex items-center gap-1 mb-0.5">
          {entry.modifiers && <ModifierIcons modifiers={entry.modifiers} />}
          {entry.speedMod !== 1 && (
            <Tooltip
              content={t('speed-mod-tooltip', {
                defaultValue: '{{speed}}x Speed',
                speed: entry.speedMod.toFixed(1),
              })}
            >
              <span className="text-[10px] font-black text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded-full">
                {entry.speedMod.toFixed(1)}x
              </span>
            </Tooltip>
          )}
          <span className="text-blue-500 font-mono font-bold tabular-nums ml-1">
            {entry.score.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {entry.difficulty && (
            <span className="text-[9px] font-black uppercase text-slice-text-muted">
              {entry.difficulty}
            </span>
          )}
          {/*
            Global board only — `skillRating` is the field that tells the two
            boards apart, and it is what the score column above is showing. The
            lifetime total moved down here: it is still a real statistic, it is
            just no longer the ranking, and showing it beside the rating is what
            makes that legible rather than surprising.
          */}
          {typeof entry.skillRating === 'number' && (
            <>
              {typeof entry.rankedPlays === 'number' && (
                <Tooltip
                  content={ts('ranked-charts-tooltip', {
                    defaultValue: '{{count}} ranked charts count toward this rating',
                    count: entry.rankedPlays,
                  })}
                >
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-slice-shadow-dark text-slice-text-muted">
                    {ts('ranked-charts-chip', {
                      defaultValue: '{{count}} charts',
                      count: entry.rankedPlays,
                    })}
                  </span>
                </Tooltip>
              )}
              {typeof entry.totalScore === 'number' && (
                <Tooltip
                  content={ts('lifetime-total-tooltip', {
                    defaultValue:
                      'Lifetime score: every point ever submitted. It measures how much you have played, not how well, which is why it no longer sets the rank.',
                  })}
                >
                  <span className="text-[10px] font-mono text-slice-text-light italic">
                    {ts('lifetime-total-chip', {
                      defaultValue: 'lifetime {{total}}',
                      total: entry.totalScore.toLocaleString(),
                    })}
                  </span>
                </Tooltip>
              )}
            </>
          )}
          {entry.accuracy !== null && (
            <Tooltip
              content={t('accuracy-tooltip', {
                defaultValue: '{{pct}}% Accuracy',
                pct: (entry.accuracy * 100).toFixed(2),
              })}
            >
              <span
                className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${
                  entry.accuracy >= 1
                    ? 'bg-cyan-100 text-cyan-600'
                    : entry.accuracy >= 0.95
                      ? 'bg-green-100 text-green-600'
                      : entry.accuracy >= 0.8
                        ? 'bg-yellow-100 text-yellow-600'
                        : 'bg-slice-shadow-dark text-slice-text-muted'
                }`}
              >
                {(entry.accuracy * 100).toFixed(1)}%
              </span>
            </Tooltip>
          )}
          {entry.maxCombo > 0 && (
            <Tooltip
              content={t('max-combo-tooltip', {
                defaultValue: '{{combo}}x Max Combo',
                combo: entry.maxCombo,
              })}
            >
              <span className="text-[10px] font-bold text-slice-text-light font-mono italic">
                {entry.maxCombo}x
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The name cell — a link to the player page when the account has a handle.
 *
 * It never builds a URL from `username`: that is display text, it is not
 * unique, and it changes whenever its owner changes it, so a link made from it
 * points at whoever holds the name today rather than at the person who set the
 * score.
 */
function PlayerName({ entry }: { entry: LeaderboardEntry }) {
  const { t } = useTranslation('r-slice-it');
  const nameClass = `font-bold truncate ${entry.isSelf ? 'text-blue-500' : 'text-slice-text'}`;

  if (!entry.handle) {
    return (
      <span className="flex-1 min-w-0 flex items-center gap-1.5 opacity-80">
        <span className={nameClass}>{entry.username}</span>
        <span className="text-[9px] uppercase tracking-wide text-slice-text-muted shrink-0">
          {t('guest', { defaultValue: 'guest' })}
        </span>
      </span>
    );
  }

  return (
    <Link
      to="/slice-it/player/$handle"
      params={{ handle: entry.handle }}
      className="flex-1 min-w-0 hover:underline"
      title={`@${entry.handle}`}
    >
      <span className={nameClass}>{entry.username}</span>
    </Link>
  );
}

function ModifierIcons({ modifiers }: { modifiers: NonNullable<LeaderboardEntry['modifiers']> }) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');

  return (
    <div className="flex items-center gap-1">
      {modifiers.bombs && (
        <Tooltip content={t('mod-bombs', { defaultValue: 'Bombs' })}>
          <Bomb className="w-3 h-3 text-red-500" />
        </Tooltip>
      )}
      {modifiers.switching && (
        <Tooltip content={t('mod-switching', { defaultValue: 'Switching' })}>
          <RefreshCw className="w-3 h-3 text-blue-400" />
        </Tooltip>
      )}
      {modifiers.suddenDeath && (
        <Tooltip content={t('mod-sudden-death', { defaultValue: 'Sudden Death' })}>
          <Flame className="w-3 h-3 text-orange-500" />
        </Tooltip>
      )}
      {modifiers.invisible && (
        <Tooltip content={t('mod-invisible-notes', { defaultValue: 'Invisible Notes' })}>
          <Ghost className="w-3 h-3 text-purple-400" />
        </Tooltip>
      )}
      {modifiers.spin && (
        <Tooltip content={t('mod-spin', { defaultValue: 'Spin Mod' })}>
          <RotateCcw className="w-3 h-3 text-indigo-400" />
        </Tooltip>
      )}
      {modifiers.strictTiming && (
        <Tooltip content={t('mod-strict-timing', { defaultValue: 'Strict Timing' })}>
          <Crosshair className="w-3 h-3 text-emerald-500" />
        </Tooltip>
      )}
      {modifiers.oneTrack && (
        <Tooltip content={t('mod-one-track', { defaultValue: 'One Track' })}>
          <Layers className="w-3 h-3 text-amber-500" />
        </Tooltip>
      )}
      {modifiers.healthGauge && (
        <Tooltip content={ts('mod-health-gauge', { defaultValue: 'Health Gauge' })}>
          <HeartPulse className="w-3 h-3 text-rose-500" />
        </Tooltip>
      )}
    </div>
  );
}
