'use client';

/**
 * DailyPuzzlesHub — the (non-3D) landing page for Daily Puzzles.
 *
 * Replaces the old persistent 3D desk with a fast, interactive React hub:
 * a live countdown to the next drop, an animated stats bar (solved today,
 * points, day-streak, all-time), filterable puzzle cards with a pointer-driven
 * tilt + spotlight, keyboard shortcuts (1–6 to jump into a puzzle), an
 * all-cleared celebration, and a one-tap "share today" summary.
 *
 * Completion state is read from BOTH persistence stores: the generic
 * daily-puzzles store (alibi/spectrum/outcast/chainlink/impostor) and the
 * standalone Lights Out store — and, for signed-in readers, synced from the
 * server first so progress follows them across devices.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles,
  Clock,
  Flame,
  Trophy,
  CheckCircle2,
  ArrowRight,
  Share2,
  Star,
  ListChecks,
} from 'lucide-react';
import { DESK_MODES, type DeskMode } from '@/lib/daily-puzzles/desk-modes';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import {
  getResult,
  getCompletedDates,
  syncFromServer,
  fetchResultFromServer,
  saveResult as saveGenericResult,
} from '@/lib/daily-puzzles/persistence';
import {
  loadSave as loadLightsOutSave,
  loadHistory as loadLightsOutHistory,
} from '@/lib/lights-out/persistence';
import { useClipboard } from '@/hooks/useClipboard';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCelebration } from '@/hooks/useCelebration';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PuzzlePage } from '@/components/daily-puzzles/PuzzleShell';
import { useSession } from '@/components/Providers';

const LIGHTS_OUT = 'lights-out';
const GENERIC_MODES = DESK_MODES.filter((m) => m.id !== LIGHTS_OUT);

type ModeStatus = { completed: boolean; label: string | null };

/** Milliseconds until the next America/New_York midnight (when puzzles rotate). */
function msToNextEstMidnight(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const val = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  let h = val('hour');
  if (h === 24) h = 0; // some engines emit 24 at midnight
  const secondsIntoDay = h * 3600 + val('minute') * 60 + val('second');
  return Math.max(0, (86400 - secondsIntoDay) * 1000);
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Longest run of consecutive days ending today/yesterday with ≥1 completion. */
function computeStreak(dates: Set<string>): number {
  const cursor = getTodayEST();
  if (!dates.has(formatDateKey(cursor))) {
    // Allow the streak to still count if today isn't played yet but yesterday was.
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(formatDateKey(cursor))) return 0;
  }
  let streak = 0;
  while (dates.has(formatDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** #rrggbb → rgba() with the given alpha (accent glows are data-driven per mode). */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Read one mode's status for a given day from local storage (SSR-safe: no-op server side). */
function readStatus(modeId: string, dateKey: string): ModeStatus {
  if (modeId === LIGHTS_OUT) {
    const save = loadLightsOutSave(dateKey);
    if (save) return { completed: true, label: save.dnf ? 'DNF' : `${save.moves}` };
    // Fall through to the generic store (populated by a server sync on other devices).
    const g = getResult(LIGHTS_OUT, dateKey);
    if (g) {
      const moves = g.resultJson?.moves ?? g.score;
      return { completed: true, label: g.resultJson?.dnf ? 'DNF' : `${moves}` };
    }
    return { completed: false, label: null };
  }
  const r = getResult(modeId, dateKey);
  if (r) return { completed: true, label: `${r.score}` };
  return { completed: false, label: null };
}

/** Every day (across all modes) the reader has completed something — for the streak. */
function collectCompletedDates(): Set<string> {
  const dates = new Set<string>();
  for (const m of GENERIC_MODES) Object.keys(getCompletedDates(m.id)).forEach((d) => dates.add(d));
  Object.keys(getCompletedDates(LIGHTS_OUT)).forEach((d) => dates.add(d));
  loadLightsOutHistory().forEach((h) => dates.add(h.dateKey));
  return dates;
}

function countAllTimeSolves(): number {
  let total = 0;
  for (const m of GENERIC_MODES) total += Object.keys(getCompletedDates(m.id)).length;
  const lo = new Set<string>([
    ...Object.keys(getCompletedDates(LIGHTS_OUT)),
    ...loadLightsOutHistory().map((h) => h.dateKey),
  ]);
  return total + lo.size;
}

type Filter = 'all' | 'todo' | 'done';

export function DailyPuzzlesHub() {
  const { t } = useTranslation('c-daily-puzzles');
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const celebrate = useCelebration();
  const session = useSession();

  // State, not a one-shot memo: a tab left open past the drop must roll to the new puzzle.
  const [today, setToday] = useState(() => getTodayEST());
  const { copy } = useClipboard();
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const puzzleNumber = useMemo(() => getPuzzleNumber(today), [today]);
  const dateLabel = useMemo(
    () => today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [today],
  );

  const [mounted, setMounted] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, ModeStatus>>({});
  const [streak, setStreak] = useState(0);
  const [allTime, setAllTime] = useState(0);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const celebratedRef = useRef(false);

  const recompute = useCallback(() => {
    const map: Record<string, ModeStatus> = {};
    for (const m of DESK_MODES) map[m.id] = readStatus(m.id, todayKey);
    setStatusMap(map);
    setStreak(computeStreak(collectCompletedDates()));
    setAllTime(countAllTimeSolves());
  }, [todayKey]);

  // Mount: read local progress immediately, then (signed-in) reconcile with server.
  useEffect(() => {
    setMounted(true);
    recompute();
    let cancelled = false;
    if (session.data) {
      (async () => {
        await Promise.all(GENERIC_MODES.map((m) => syncFromServer(m.id).catch(() => {})));
        const lo = await fetchResultFromServer(LIGHTS_OUT, todayKey).catch(() => null);
        if (lo) saveGenericResult(LIGHTS_OUT, todayKey, lo);
        if (!cancelled) recompute();
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [recompute, session.data, todayKey]);

  // Live countdown to the next drop (client-only, so the ticking text can't cause a
  // hydration mismatch).
  useEffect(() => {
    const tick = () => {
      setCountdown(formatCountdown(msToNextEstMidnight()));
      const fresh = getTodayEST();
      setToday((cur) => (formatDateKey(cur) === formatDateKey(fresh) ? cur : fresh));
    };
    tick();
    const id = setInterval(tick, 1000);
    // Timers are throttled/suspended in background tabs and on locked phones.
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const solvedToday = useMemo(
    () => DESK_MODES.reduce((n, m) => n + (statusMap[m.id]?.completed ? 1 : 0), 0),
    [statusMap],
  );
  const pointsToday = useMemo(
    () =>
      GENERIC_MODES.reduce((sum, m) => {
        const r = getResult(m.id, todayKey);
        return sum + (statusMap[m.id]?.completed && r ? r.score : 0);
      }, 0),
    [statusMap, todayKey],
  );
  const allDone = mounted && solvedToday === DESK_MODES.length;

  // Reward clearing the whole board.
  useEffect(() => {
    if (allDone && !celebratedRef.current) {
      celebratedRef.current = true;
      void celebrate({ kind: 'fireworks' });
    }
  }, [allDone, celebrate]);

  const openMode = useCallback(
    (mode: DeskMode) => {
      navigate({ to: `/daily/${mode.id}` as string });
    },
    [navigate],
  );

  // Keyboard: press 1–6 to jump straight into a puzzle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const idx = Number(e.key);
      if (Number.isInteger(idx) && idx >= 1 && idx <= DESK_MODES.length) {
        e.preventDefault();
        openMode(DESK_MODES[idx - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openMode]);

  const shareToday = useCallback(async () => {
    const row = DESK_MODES.map((m) => `${m.emoji}${statusMap[m.id]?.completed ? '✅' : '⬜'}`).join(
      ' ',
    );
    const bonus = [
      streak > 0 ? `🔥 ${streak}` : null,
      pointsToday > 0 ? `🏆 ${pointsToday} pts` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const text = [
      `🧩 RMH Daily Puzzles #${puzzleNumber} — ${solvedToday}/${DESK_MODES.length}`,
      '',
      row,
      bonus,
      '',
      'https://rmhstudios.com/daily',
    ]
      .filter((l) => l !== null)
      .join('\n');
    if (await copy(text)) toast.success(t('copied', { defaultValue: 'Copied!' }));
    else toast.error(t('copy-failed', { defaultValue: 'Could not copy to clipboard.' }));
  }, [statusMap, streak, pointsToday, puzzleNumber, solvedToday, t, copy]);

  const visibleModes = useMemo(() => {
    if (filter === 'todo') return DESK_MODES.filter((m) => !statusMap[m.id]?.completed);
    if (filter === 'done') return DESK_MODES.filter((m) => statusMap[m.id]?.completed);
    return DESK_MODES;
  }, [filter, statusMap]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: t('filter-all', { defaultValue: 'All' }), count: DESK_MODES.length },
    {
      id: 'todo',
      label: t('filter-todo', { defaultValue: 'To do' }),
      count: DESK_MODES.length - solvedToday,
    },
    { id: 'done', label: t('filter-done', { defaultValue: 'Done' }), count: solvedToday },
  ];

  return (
    <PuzzlePage width="lg" className="relative">
      <AuroraBackground />

      <div className="relative flex flex-col gap-4 sm:gap-6">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <header className="flex flex-col items-center gap-2 text-center">
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-site-accent"
          >
            <Sparkles className="size-4" aria-hidden />
            {t('daily-puzzles-title', { defaultValue: 'Daily Puzzles' })}
          </motion.p>
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-3xl font-bold tracking-tight text-site-text sm:text-4xl"
          >
            {t('hub-headline', { defaultValue: "Today's Puzzles" })}
          </motion.h1>
          <motion.p
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm text-site-text-muted"
          >
            {dateLabel} · {t('puzzle-number', { defaultValue: 'Puzzle #{{n}}', n: puzzleNumber })}
          </motion.p>

          {/* Live countdown to the next drop */}
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="glass-fill inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          >
            <Clock className="size-4 text-site-accent" aria-hidden />
            <span className="text-site-text-muted">
              {t('next-drop-in', { defaultValue: 'Next drop in' })}
            </span>
            <span
              className="font-mono font-semibold tabular-nums text-site-text"
              suppressHydrationWarning
            >
              {countdown ?? '—:—:—'}
            </span>
          </motion.div>
        </header>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label={t('todays-progress', { defaultValue: "Today's progress" })}
        >
          <StatTile
            icon={<ListChecks className="size-4" aria-hidden />}
            label={t('stat-solved-today', { defaultValue: 'Solved today' })}
            value={`${solvedToday}/${DESK_MODES.length}`}
            highlight={allDone}
          />
          <StatTile
            icon={<Trophy className="size-4" aria-hidden />}
            label={t('stat-points-today', { defaultValue: 'Points today' })}
            value={<AnimatedCount value={pointsToday} />}
          />
          <StatTile
            icon={
              <Flame className={`size-4 ${streak > 0 ? 'text-site-warning' : ''}`} aria-hidden />
            }
            label={t('stat-streak', { defaultValue: 'Day streak' })}
            value={<AnimatedCount value={streak} />}
            highlight={streak >= 3}
          />
          <StatTile
            icon={<Star className="size-4" aria-hidden />}
            label={t('stat-all-time', { defaultValue: 'All-time solves' })}
            value={<AnimatedCount value={allTime} />}
          />
        </section>

        {/* ── Overall progress bar ────────────────────────────────────────── */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={DESK_MODES.length}
          aria-valuenow={solvedToday}
          aria-label={t('todays-progress', { defaultValue: "Today's progress" })}
          className="h-2 overflow-hidden rounded-full bg-site-surface"
        >
          <motion.div
            className="h-full w-full origin-left rounded-full bg-site-accent"
            initial={false}
            animate={{ scaleX: solvedToday / DESK_MODES.length }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>

        {/* ── Filters + share ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Filter tabs → shared LiquidTabs (§5.4): the single flowing-capsule
              implementation replaces this hub's hand-rolled layoutId pill. */}
          <LiquidTabs
            tabs={filters}
            value={filter}
            onChange={(id) => setFilter(id as Filter)}
            size="sm"
            scroll
            aria-label={t('filter-label', { defaultValue: 'Filter puzzles' })}
          />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={shareToday}
            disabled={!mounted || solvedToday === 0}
          >
            <Share2 aria-hidden />
            {t('share-today', { defaultValue: 'Share today' })}
          </Button>
        </div>

        {/* ── All-cleared banner ──────────────────────────────────────────── */}
        <AnimatePresence>
          {allDone && (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-center gap-2 rounded-site border border-site-success/40 bg-site-success/10 px-4 py-3 text-center text-sm font-medium text-site-text">
                <CheckCircle2 className="size-5 text-site-success" aria-hidden />
                {t('all-cleared', { defaultValue: '🎉 All puzzles cleared today — nice!' })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Puzzle cards ────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visibleModes.map((mode) => (
              <motion.div
                key={mode.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                transition={
                  reduced ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 26 }
                }
              >
                <PuzzleCard
                  mode={mode}
                  index={DESK_MODES.indexOf(mode) + 1}
                  status={statusMap[mode.id] ?? { completed: false, label: null }}
                  mounted={mounted}
                  onOpen={() => openMode(mode)}
                  labelPts={t('pts-suffix', { defaultValue: 'pts' })}
                  labelMoves={t('moves-suffix', { defaultValue: 'moves' })}
                  ctaPlay={t('play', { defaultValue: 'Play' })}
                  ctaView={t('view-results-short', { defaultValue: 'View' })}
                  title={t(`mode-title-${mode.id}`, { defaultValue: mode.title })}
                  description={t(mode.descriptionKey, { defaultValue: mode.descriptionDefault })}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </section>

        {visibleModes.length === 0 && (
          <p className="text-center text-sm text-site-text-muted">
            {filter === 'done'
              ? t('none-done-yet', { defaultValue: 'Nothing solved yet — pick a puzzle to start.' })
              : t('all-done-filter', { defaultValue: 'All caught up! Every puzzle is solved.' })}
          </p>
        )}

        <p className="text-center text-xs text-site-text-muted">
          {t('hub-footer', {
            defaultValue: 'New puzzles every day at midnight EST — same for everyone worldwide.',
          })}
        </p>
      </div>
    </PuzzlePage>
  );
}

/* ── Stat tile ─────────────────────────────────────────────────────────────── */

function StatTile({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`glass-fill flex flex-col gap-1 rounded-site border px-4 py-3 transition-colors duration-site-fast ${
        highlight ? 'border-site-accent/50' : 'border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 text-site-text-muted">
        <span className={highlight ? 'text-site-accent' : ''}>{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums text-site-text">{value}</div>
    </div>
  );
}

/* ── Aurora background ─────────────────────────────────────────────────────── */

function AuroraBackground() {
  // A few soft accent blobs behind the content. Decorative + inert — and STILL.
  // They used to drift and swell forever on a framer `repeat: Infinity` loop:
  // three 64px-`blur` layers re-scaled from the main thread every frame, so the
  // hub never went idle (2.1 cores and 41fps at rest on desktop, perf audit
  // 2026-10-08). A scaled blur cannot be cached; a static one is rasterised once.
  // Same rule as the site backdrop (lib/__tests__/static-backdrop.test.ts).
  const blobs = [
    { color: DESK_MODES[2].accent, className: 'left-[-8%] top-[2%] h-72 w-72' },
    { color: DESK_MODES[4].accent, className: 'right-[-6%] top-[18%] h-80 w-80' },
    { color: DESK_MODES[1].accent, className: 'left-[24%] top-[40%] h-64 w-64' },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {blobs.map((b, i) => (
        <div
          key={i}
          className={`absolute rounded-full blur-3xl ${b.className}`}
          style={{ background: hexToRgba(b.color, 0.14) }}
        />
      ))}
    </div>
  );
}

/* ── Puzzle card ───────────────────────────────────────────────────────────── */

function PuzzleCard({
  mode,
  index,
  status,
  mounted,
  onOpen,
  labelPts,
  labelMoves,
  ctaPlay,
  ctaView,
  title,
  description,
}: {
  mode: DeskMode;
  index: number;
  status: ModeStatus;
  mounted: boolean;
  onOpen: () => void;
  labelPts: string;
  labelMoves: string;
  ctaPlay: string;
  ctaView: string;
  title: string;
  description: string;
}) {
  const done = mounted && status.completed;
  const isLightsOut = mode.id === LIGHTS_OUT;
  const scoreText =
    status.label == null
      ? null
      : status.label === 'DNF'
        ? 'DNF'
        : `${status.label} ${isLightsOut ? labelMoves : labelPts}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-fill glass-interactive group relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-site px-4 py-4 text-left"
      aria-label={`${title} — ${done ? ctaView : ctaPlay}`}
    >
      {/* Accent top edge — decoration only; the per-mode accent is data. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 opacity-70 transition-opacity duration-site-fast group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${mode.accent}, transparent)` }}
      />

      <div className="flex items-start justify-between gap-2">
        <span className="text-4xl" aria-hidden>
          {mode.emoji}
        </span>
        {done ? (
          <Badge variant="success" size="sm" icon={false}>
            <CheckCircle2 aria-hidden />
            {scoreText}
          </Badge>
        ) : (
          <span
            aria-hidden
            className="rounded-site-sm border border-site-border px-2 py-0.5 font-mono text-xs text-site-text-muted"
          >
            {index}
          </span>
        )}
      </div>

      <h3 className="text-lg font-bold text-site-text">{title}</h3>
      <p className="flex-1 text-sm text-site-text-muted">{description}</p>

      {/* The LABEL takes the card's ink; the accent is carried by the arrow.
          Painting the label itself in the raw per-mode accent put it at
          1.79-3.78:1 on the white card — the yellow mode's "Play →" nearly
          vanished. Decoration can be brand-coloured; the words cannot. */}
      <span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-site-text">
        {done ? ctaView : ctaPlay}
        <ArrowRight
          className="size-4 transition-transform duration-site-fast group-hover:translate-x-1"
          style={{ color: mode.accent }}
          aria-hidden
        />
      </span>
    </button>
  );
}
