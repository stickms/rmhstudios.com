'use client';

/**
 * Nightrail — everything that is not the run itself: the menu, the level
 * picker, the Tricktionary, and the two ways a run can end.
 *
 * Score submission and the leaderboard both go through the SHARED game
 * endpoints (`/api/games/:id/…`) rather than a bespoke pair of routes, so the
 * plausibility checks, rate limits and progression hooks in
 * `lib/game/submit.server` apply here for free.
 *
 * Interpolated counts below are passed as `n`, never `count`: i18next treats a
 * `count` variable as a request for a plural key family, so the translators
 * would be handed `rails-count_one` / `rails-count_other` for a label that has
 * no singular form in play.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Gauge,
  Lock,
  Play,
  RotateCcw,
  Timer,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { TRICK_LIST } from '@/lib/nightrail/constants';
import { LEVELS, LEVEL_ORDER } from '@/lib/nightrail/levels';
import type { LevelId, RunStats, TrickDirection } from '@/lib/nightrail/types';

export type UIState =
  'menu' | 'levelSelect' | 'tricktionary' | 'playing' | 'crashed' | 'runComplete';

interface Props {
  uiState: UIState;
  runStats: RunStats | null;
  unlockedLevels: Set<LevelId>;
  onStartLevel: (id: LevelId) => void;
  onSetUiState: (next: UIState) => void;
  onRestart: () => void;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  progress: number;
  userId: string;
}

/** The shared leaderboard envelope. `game` is metadata we do not need here. */
interface LeaderboardResponse {
  entries?: LeaderboardEntry[];
}

const GAME_ID = 'nightrail';

/**
 * The desktop key for each direction, mirroring the handler in
 * `NightrailGame.tsx`.
 *
 * A stick throws all eight directions naturally; a keyboard cannot, so the
 * four straight tricks sit on the arrows and the diagonals get number keys.
 * Printing the key beside the arrow is the only place a player finds that out.
 */
const DIRECTION_KEYS: Record<TrickDirection, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  upLeft: '1',
  upRight: '2',
  downLeft: '3',
  downRight: '4',
};

/** One arrow per stick direction, so the Tricktionary reads as a move list. */
const DIRECTION_ICONS: Record<TrickDirection, typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
  upLeft: ArrowUpLeft,
  upRight: ArrowUpRight,
  downLeft: ArrowDownLeft,
  downRight: ArrowDownRight,
};

const RANK_COLORS: Record<RunStats['rank'], string> = {
  C: 'text-slate-300',
  B: 'text-cyan-300',
  A: 'text-fuchsia-300',
  S: 'text-amber-300',
};

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

const SCREEN =
  'app-screen absolute inset-0 z-40 pointer-events-auto bg-slate-950/85 backdrop-blur-sm';
const PANEL = 'rounded-xl border border-slate-700/70 bg-slate-900/70 p-4';
const STAT_LABEL = 'text-[11px] uppercase tracking-wider text-slate-500';
/** One column grammar shared by the Tricktionary header and its rows. */
const TRICK_ROW = 'grid grid-cols-[1.25rem_1fr_4.5rem_3.25rem] items-center gap-x-3 text-xs';

export function NightrailUI({
  uiState,
  runStats,
  unlockedLevels,
  onStartLevel,
  onSetUiState,
  onRestart,
}: Props) {
  const { t } = useTranslation('c-nightrail');
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  // A ref, not the state flag, guards the POST: state updates are async, and
  // two effect runs in the same tick would both read `false` and double-submit.
  const submitting = useRef(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${GAME_ID}/leaderboard?limit=10`);
      if (!res.ok) return;
      const data: LeaderboardResponse = await res.json();
      setLeaderboard(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      /* a missing leaderboard is not worth interrupting the player over */
    }
  }, []);

  useEffect(() => {
    if (uiState === 'menu' || uiState === 'crashed' || uiState === 'runComplete') {
      void fetchLeaderboard();
    }
  }, [uiState, fetchLeaderboard]);

  // Both endings submit: a wrecked run is still a score, and hiding it would
  // make the leaderboard a record of luck rather than of play.
  useEffect(() => {
    if (uiState !== 'crashed' && uiState !== 'runComplete') return;
    if (!runStats || !session.data || submitting.current) return;

    const user = session.data.user as { name?: string | null; username?: string | null };
    const username = user.username || user.name || 'Courier';
    submitting.current = true;
    setScoreSubmitted(true);

    void (async () => {
      try {
        await fetch(`/api/games/${GAME_ID}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            score: Math.round(runStats.score),
            progress: Math.round(runStats.distance),
            durationMs: Math.round(runStats.timeMs),
            username,
            meta: { level: runStats.level },
          }),
        });
        void fetchLeaderboard();
      } catch {
        /* ignore — the run is over either way */
      }
    })();
  }, [uiState, runStats, session.data, fetchLeaderboard]);

  useEffect(() => {
    if (uiState === 'playing') {
      submitting.current = false;
      setScoreSubmitted(false);
    }
  }, [uiState]);

  if (uiState === 'playing') return null;

  const signedIn = Boolean(session.data);
  const goLogin = () => navigate({ to: '/login', search: { callbackURL: undefined } });

  const leaderboardPanel = (limit: number, title: string) =>
    leaderboard.length > 0 ? (
      <div className={PANEL}>
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</span>
        </div>
        <ul className="space-y-1">
          {leaderboard.slice(0, limit).map((entry) => (
            <li key={entry.userId} className="flex justify-between gap-3 text-xs">
              <span className="truncate text-slate-400">
                #{entry.rank} {entry.username}
              </span>
              <span className="font-bold text-cyan-300 tabular-nums">
                {entry.score.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const backButton = (to: UIState) => (
    <button
      type="button"
      onClick={() => onSetUiState(to)}
      className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-white sm:text-sm"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t('back', { defaultValue: 'Back' })}
    </button>
  );

  // ── Menu ──
  if (uiState === 'menu') {
    return (
      <div className={SCREEN}>
        <div className="w-full max-w-md space-y-5 text-center">
          <div>
            <h1 className="bg-linear-to-r from-cyan-300 via-white to-fuchsia-400 bg-clip-text text-4xl font-black tracking-tighter text-transparent sm:text-6xl">
              NIGHTRAIL
            </h1>
            <p className="mt-2 text-xs text-slate-400 sm:text-sm">
              {t('menu-tagline', {
                defaultValue:
                  'Run the night freight. Drift the bends to keep your speed, switch rails to live, and land tricks between here and the depot.',
              })}
            </p>
          </div>

          <div className="space-y-3">
            {signedIn ? (
              <Button
                onClick={() => onSetUiState('levelSelect')}
                className="w-full bg-linear-to-r from-cyan-500 to-fuchsia-500 py-3 text-lg font-bold text-slate-950 hover:from-cyan-400 hover:to-fuchsia-400"
              >
                <Play className="mr-2 h-5 w-5" aria-hidden="true" />
                {t('play', { defaultValue: 'Play' })}
              </Button>
            ) : (
              <Button
                onClick={goLogin}
                className="w-full bg-slate-800 py-3 font-bold text-white hover:bg-slate-700"
              >
                {t('sign-in-to-play', { defaultValue: 'Sign In to Play' })}
              </Button>
            )}

            <Button
              onClick={() => onSetUiState('tricktionary')}
              variant="outline"
              className="w-full border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('tricktionary', { defaultValue: 'Tricktionary' })}
            </Button>
          </div>

          {leaderboardPanel(5, t('top-scores', { defaultValue: 'Top Scores' }))}

          <div className="space-y-1 text-[10px] text-slate-600 sm:text-xs">
            <p className="hidden sm:block">
              {/* Kept in step with the key handler in NightrailGame.tsx — the
                  arrows are tricks, not steering, which is the one thing a
                  racer's muscle memory will get wrong on the first run. */}
              {t('keys-line-1', {
                defaultValue:
                  'A / D switch rails · Shift or S hold to drift · Space hold to charge a jump · W boost · Esc pause',
              })}
            </p>
            <p className="hidden sm:block">
              {t('keys-line-2', {
                defaultValue:
                  'In the air: arrow keys throw the four straight tricks, 1–4 the diagonals, or drag the mouse in any of the eight directions. A gamepad uses the right stick.',
              })}
            </p>
            <p className="sm:hidden">
              {t('touch-controls-hint', { defaultValue: 'Touch controls appear during the run' })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Level select ──
  if (uiState === 'levelSelect') {
    return (
      <div className={SCREEN}>
        <div className="w-full max-w-lg space-y-4">
          {backButton('menu')}

          <h2 className="text-center text-2xl font-black tracking-tight text-white sm:text-3xl">
            {t('select-line', { defaultValue: 'SELECT LINE' })}
          </h2>

          <div className="grid gap-3">
            {LEVEL_ORDER.map((id) => {
              const level = LEVELS[id];
              const unlocked = unlockedLevels.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => onStartLevel(id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    unlocked
                      ? 'cursor-pointer border-slate-600 bg-slate-900/80 hover:border-cyan-400'
                      : 'cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-white">
                        {t('level-name', {
                          defaultValue: 'Line {{id}}: {{name}}',
                          id,
                          name: level.name,
                        })}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-400">{level.subtitle}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>
                          {t('rails-count', { defaultValue: '{{n}} rails', n: level.rails })}
                        </span>
                        <span>
                          {t('par-time', {
                            defaultValue: 'Par {{time}}',
                            time: formatClock(level.parTime * 1000),
                          })}
                        </span>
                        <span>
                          {t('cargo-count', { defaultValue: '{{n}} crates', n: level.cargo })}
                        </span>
                      </div>
                    </div>
                    {unlocked ? (
                      <span className="shrink-0 rounded-full bg-cyan-500 px-3 py-1 text-xs font-bold text-slate-950">
                        {t('go', { defaultValue: 'GO' })}
                      </span>
                    ) : (
                      <Lock className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-center text-[10px] text-slate-600 sm:text-xs">
            {t('unlock-hint', {
              defaultValue: 'Finish a line with cargo aboard to open the next one',
            })}
          </p>
        </div>
      </div>
    );
  }

  // ── Tricktionary ──
  if (uiState === 'tricktionary') {
    return (
      <div className={SCREEN}>
        <div className="w-full max-w-lg space-y-4">
          {backButton('menu')}

          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {t('tricktionary', { defaultValue: 'Tricktionary' })}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {t('tricktionary-hint', {
                defaultValue:
                  'Flick a direction in the air. Each new trick in a combo raises the multiplier — repeat one and it pays half.',
              })}
            </p>
          </div>

          <div className={PANEL}>
            <div className={`${TRICK_ROW} pb-1`}>
              <span className="sr-only">{t('direction', { defaultValue: 'Direction' })}</span>
              <span className={STAT_LABEL}>{t('trick', { defaultValue: 'Trick' })}</span>
              <span className={`${STAT_LABEL} text-right`}>
                {t('points', { defaultValue: 'Points' })}
              </span>
              <span className={`${STAT_LABEL} text-right`}>
                {t('air', { defaultValue: 'Air' })}
              </span>
            </div>
            {TRICK_LIST.map((trick) => {
              const Icon = DIRECTION_ICONS[trick.direction];
              return (
                <div
                  key={trick.direction}
                  className={`${TRICK_ROW} border-t border-slate-800 py-2`}
                >
                  <span className="flex items-center gap-1 text-cyan-300">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <kbd className="rounded-full border border-slate-700 px-1 text-[10px] text-slate-400">
                      {DIRECTION_KEYS[trick.direction]}
                    </kbd>
                  </span>
                  <span className="truncate font-bold text-white">{trick.name}</span>
                  <span className="text-right font-bold text-fuchsia-300 tabular-nums">
                    {trick.points.toLocaleString()}
                  </span>
                  <span className="text-right text-slate-400 tabular-nums">
                    {trick.duration.toFixed(2)}s
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[10px] text-slate-600 sm:text-xs">
            {t('landing-hint', {
              defaultValue:
                'The long tricks are the greedy ones — touch down mid-rotation and the whole combo bails.',
            })}
          </p>
        </div>
      </div>
    );
  }

  // ── Crashed ──
  if (uiState === 'crashed' && runStats) {
    return (
      <div className={SCREEN}>
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight text-rose-500 sm:text-4xl">
              {t('cargo-lost', { defaultValue: 'CARGO LOST' })}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {t('cargo-lost-sub', { defaultValue: 'Cargo lost — run over.' })}
            </p>
          </div>

          <div className={`${PANEL} space-y-3`}>
            <div className="text-center">
              <div className={STAT_LABEL}>{t('score', { defaultValue: 'Score' })}</div>
              <div className="text-3xl font-black text-cyan-300 tabular-nums">
                {Math.round(runStats.score).toLocaleString()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className={STAT_LABEL}>{t('distance', { defaultValue: 'Distance' })}</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {Math.round(runStats.distance).toLocaleString()}m
                </div>
              </div>
              <div>
                <div className={STAT_LABEL}>{t('time', { defaultValue: 'Time' })}</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {formatClock(runStats.timeMs)}
                </div>
              </div>
            </div>
          </div>

          {signedIn ? (
            <p className="text-center text-xs text-emerald-400">
              {scoreSubmitted
                ? t('score-submitted', { defaultValue: 'Score submitted!' })
                : t('submitting-score', { defaultValue: 'Submitting score…' })}
            </p>
          ) : (
            <Button
              onClick={goLogin}
              className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700"
            >
              {t('sign-in-to-submit', { defaultValue: 'Sign In to Submit Score' })}
            </Button>
          )}

          <div className="flex gap-2">
            <Button
              onClick={onRestart}
              className="flex-1 bg-cyan-600 font-bold text-white hover:bg-cyan-500"
            >
              <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('restart', { defaultValue: 'Restart' })}
            </Button>
            <Button
              onClick={() => onSetUiState('levelSelect')}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              {t('level-select', { defaultValue: 'Line Select' })}
            </Button>
          </div>

          {leaderboardPanel(10, t('leaderboard', { defaultValue: 'Leaderboard' }))}
        </div>
      </div>
    );
  }

  // ── Run complete ──
  if (uiState === 'runComplete' && runStats) {
    return (
      <div className={SCREEN}>
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <div className={STAT_LABEL}>
              {t('delivery-rank', { defaultValue: 'Delivery rank' })}
            </div>
            <div className={`text-7xl font-black leading-none ${RANK_COLORS[runStats.rank]}`}>
              {runStats.rank}
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl">
              {t('delivered', { defaultValue: 'DELIVERED' })}
            </h2>
          </div>

          <div className={`${PANEL} space-y-3`}>
            <div className="text-center">
              <div className={STAT_LABEL}>{t('score', { defaultValue: 'Score' })}</div>
              <div className="text-3xl font-black text-cyan-300 tabular-nums">
                {Math.round(runStats.score).toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className={STAT_LABEL}>
                  <Timer className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  {t('time', { defaultValue: 'Time' })}
                </div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {formatClock(runStats.timeMs)}
                </div>
              </div>
              <div>
                <div className={STAT_LABEL}>{t('distance', { defaultValue: 'Distance' })}</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {Math.round(runStats.distance).toLocaleString()}m
                </div>
              </div>
              <div>
                <div className={STAT_LABEL}>
                  <Gauge className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  {t('best-multiplier', { defaultValue: 'Best multiplier' })}
                </div>
                <div className="text-lg font-bold text-fuchsia-300 tabular-nums">
                  ×{runStats.bestMultiplier.toFixed(1)}
                </div>
              </div>
              <div>
                <div className={STAT_LABEL}>
                  {t('tricks-landed', { defaultValue: 'Tricks landed' })}
                </div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {runStats.tricksLanded}
                </div>
              </div>
              <div>
                <div className={STAT_LABEL}>
                  <Boxes className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  {t('cargo-delivered', { defaultValue: 'Cargo delivered' })}
                </div>
                <div className="text-lg font-bold text-amber-300 tabular-nums">
                  {runStats.cargoDelivered}/{runStats.cargoStart}
                </div>
              </div>
              <div>
                <div className={STAT_LABEL}>{t('best-combo', { defaultValue: 'Best combo' })}</div>
                <div className="text-lg font-bold text-white tabular-nums">
                  {Math.round(runStats.bestCombo).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="text-center text-xs text-slate-500">
              {t('level-name', {
                defaultValue: 'Line {{id}}: {{name}}',
                id: runStats.level,
                name: LEVELS[runStats.level].name,
              })}
            </div>
          </div>

          {signedIn ? (
            <p className="text-center text-xs text-emerald-400">
              {scoreSubmitted
                ? t('score-submitted', { defaultValue: 'Score submitted!' })
                : t('submitting-score', { defaultValue: 'Submitting score…' })}
            </p>
          ) : (
            <Button
              onClick={goLogin}
              className="w-full bg-blue-600 font-bold text-white hover:bg-blue-700"
            >
              {t('sign-in-to-submit', { defaultValue: 'Sign In to Submit Score' })}
            </Button>
          )}

          <div className="flex gap-2">
            <Button
              onClick={onRestart}
              className="flex-1 bg-cyan-600 font-bold text-white hover:bg-cyan-500"
            >
              <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('run-again', { defaultValue: 'Run Again' })}
            </Button>
            <Button
              onClick={() => onSetUiState('levelSelect')}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              {t('level-select', { defaultValue: 'Line Select' })}
            </Button>
          </div>

          {leaderboardPanel(10, t('leaderboard', { defaultValue: 'Leaderboard' }))}
        </div>
      </div>
    );
  }

  return null;
}
