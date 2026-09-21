'use client';

/**
 * GlobeSet — the daily run.
 *
 * Owns the clock, the selection, the hint, the auto-solver's playback and the
 * three places a finished run has to land: local storage (so a reload resumes),
 * the shared Daily Puzzles store (so the hub's tiles and streak see it), and
 * the server (so the leaderboard ranks it).
 *
 * Two decisions worth knowing before editing:
 *
 * **The board claims a GlobeSet the moment the selection XORs to zero.** There is
 * no submit button, because a submit button on a rule that can be checked
 * instantly is just a second click. What that removes is the "wrong answer"
 * event, so accuracy is measured instead by dead ends — selections backed out
 * of that could no longer have completed — counted silently and revealed in the
 * results (see `recordDeadEnd` in `lib/globeset/game.ts`).
 *
 * **Elapsed time is accumulated, not derived from a start timestamp.** A run
 * takes minutes and people reload, so the snapshot has to survive a refresh;
 * storing `startedAt` would keep the clock running while the tab was closed and
 * hand somebody a four-hour run for going to lunch.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Box,
  Compass,
  Globe2,
  HelpCircle,
  LayoutGrid,
  Shapes,
  Swords,
  Sparkles,
} from 'lucide-react';
import { formatDateKey, getTodayEST, getPuzzleNumber } from '@/lib/daily-puzzles/seed';
import {
  fetchResultFromServer,
  getResult,
  saveResult,
  saveResultWithSync,
  type PuzzleResult,
} from '@/lib/daily-puzzles/persistence';
import { BOARD_SIZE, xorAll, type Card } from '@/lib/globeset/cards';
import { findSmallestGlobeSet, selectionIsViable } from '@/lib/globeset/solver';
import {
  applySolverStep,
  cardsRemaining,
  createRun,
  dealForDate,
  recordDeadEnd,
  runProgress,
  scoreRun,
  submitSelection,
  summarise,
  takeHint,
  type RunState,
  type RunSummary,
} from '@/lib/globeset/game';
import {
  clearRun,
  loadRun,
  loadStats,
  recordCompletion,
  saveRun,
  streakFrom,
  type GlobeSetStats,
} from '@/lib/globeset/persistence';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCelebration } from '@/hooks/useCelebration';
import { useDeviceAttitude } from '@/hooks/useDeviceAttitude';
import type { Quat } from '@/lib/device-attitude';
import { authClient } from '@/lib/auth-client';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PastPuzzlesSection } from '@/components/daily-puzzles/PastPuzzlesSection';
import { GlobeSetBoard } from './GlobeSetBoard';
import { GlobeSetGlobe } from './GlobeSetGlobe';
import { arSupported } from '@/lib/globeset/xr';

/**
 * The room view carries three.js, so it is fetched when somebody asks for it
 * and never as part of the page. Most players are on a device that cannot run
 * it at all (`arSupported()` is false on every desktop and on all of iOS), and
 * they should not pay for a renderer they will never be offered.
 */
const GlobeSetXr = lazy(() => import('./GlobeSetXr').then((m) => ({ default: m.GlobeSetXr })));
import { GlobeSetHud } from './GlobeSetHud';
import { GlobeSetResults } from './GlobeSetResults';
import { GlobeSetRules } from './GlobeSetRules';
import { GlobeSetRace } from './GlobeSetRace';

/** How long the solver lingers on each GlobeSet before lifting it. */
const SOLVER_STEP_MS = 850;
/** Snapshot cadence. Often enough that a crash costs seconds, rarely enough to be free. */
const AUTOSAVE_MS = 2000;
const SHAPES_KEY = 'rmh-globeset-shapes';
const VIEW_KEY = 'rmh-globeset-view';

type Tab = 'daily' | 'race';

/**
 * Where the cards are.
 *
 * `globe` is the game: seven cards pinned to a sphere you turn. `board` lays
 * the same seven out flat — kept because a globe is a gesture, and a gesture is
 * not available to everyone or wanted by everyone. Both drive the identical run
 * state, so switching mid-deck changes nothing but the view.
 */
export type CardView = 'globe' | 'board';

function initialView(): CardView {
  if (typeof window === 'undefined') return 'globe';
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'globe';
  } catch {
    return 'globe';
  }
}

/** Distinct shapes default on for anyone already telling us about colour vision. */
function initialShapes(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(SHAPES_KEY);
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch {
    /* storage unavailable — fall through to the colour-vision default */
  }
  const mode = document.documentElement.getAttribute('data-color-vision');
  return Boolean(mode) && mode !== 'none';
}

export function GlobeSetGame() {
  const { t } = useTranslation('c-daily-puzzles');
  const reduced = useReducedMotion();
  const celebrate = useCelebration();
  const confirm = useConfirm();
  const session = authClient.useSession();

  const today = useMemo(() => getTodayEST(), []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const [dateKey, setDateKey] = useState(todayKey);
  const isToday = dateKey === todayKey;
  const puzzleNumber = useMemo(() => getPuzzleNumber(new Date(`${dateKey}T00:00:00`)), [dateKey]);
  const deck = useMemo(() => dealForDate(dateKey), [dateKey]);

  const [tab, setTab] = useState<Tab>('daily');
  const [run, setRun] = useState<RunState>(() => createRun(deck, BOARD_SIZE));
  /** Selection is CARD VALUES, not board positions — see `GlobeSetBoard`. */
  const [selected, setSelected] = useState<Card[]>([]);
  const [hinted, setHinted] = useState<Card[]>([]);
  const [solving, setSolving] = useState<Card[]>([]);
  const [solverRunning, setSolverRunning] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [shapes, setShapes] = useState(false);
  const [view, setView] = useState<CardView>('globe');
  /** Whether this device can run an `immersive-ar` session, and whether it is. */
  const [arAvailable, setArAvailable] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  /**
   * Today's run, if it is already in the books.
   *
   * GlobeSet is one run per day, like every other daily mode: the deck is the
   * same all day, so a second attempt would be a replay of a puzzle you have
   * already seen — and because the leaderboard ranks TIME, an unlimited replay
   * would simply be a way to grind a better one. Coming back shows the result
   * instead of re-dealing.
   */
  const [savedResult, setSavedResult] = useState<PuzzleResult | null>(null);
  const [stats, setStats] = useState<GlobeSetStats>(() => ({
    v: 1,
    runs: 0,
    bestSeconds: null,
    totalGlobeSets: 0,
    playedDates: [],
  }));

  /** Milliseconds banked before the current tick window. */
  const bankedRef = useRef(0);
  /** Wall clock the current tick window opened at, or null while the clock is stopped. */
  const runningSinceRef = useRef<number | null>(null);
  /** Number of GlobeSets the player found before handing the deck to the solver. */
  const solverFromRef = useRef<number | undefined>(undefined);
  const completedRef = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const finished = run.status === 'complete';
  /**
   * No input, no clock, no autosave. A stored result locks the day too: the
   * board is not rendered, but the `H` hint shortcut and the run timer live up
   * here and would otherwise keep going behind the results panel.
   */
  const locked = finished || solverRunning || savedResult !== null;

  /* ── Clock ─────────────────────────────────────────────────────────────── */

  const readClock = useCallback(() => {
    const open = runningSinceRef.current;
    return bankedRef.current + (open === null ? 0 : Date.now() - open);
  }, []);

  const stopClock = useCallback(() => {
    bankedRef.current = readClock();
    runningSinceRef.current = null;
    setElapsedMs(bankedRef.current);
  }, [readClock]);

  useEffect(() => {
    if (locked) return;
    const id = window.setInterval(() => setElapsedMs(readClock()), 250);
    return () => window.clearInterval(id);
  }, [locked, readClock]);

  /* ── Mount: settings, stats, and whatever run was left open ────────────── */

  useEffect(() => {
    setShapes(initialShapes());
    setView(initialView());
    setStats(loadStats());
    // Permission-free and never throws; a false simply hides the control.
    let cancelled = false;
    void arSupported().then((ok) => {
      if (!cancelled) setArAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleView = useCallback(() => {
    setView((current) => {
      const next: CardView = current === 'globe' ? 'board' : 'globe';
      try {
        window.localStorage.setItem(VIEW_KEY, next);
      } catch {
        /* the choice still holds for this session */
      }
      return next;
    });
  }, []);

  // Restoring keys off `dateKey`, so picking a past puzzle from the archive
  // deals that day fresh rather than dragging today's half-finished board into
  // it. `loadRun` verifies the snapshot against the deal before trusting it.
  useEffect(() => {
    let cancelled = false;
    const local = getResult('globeset', dateKey);
    setSavedResult(local);
    // Signed in? Reconcile with the server so a run finished on the phone shows
    // as finished on the laptop.
    if (session.data) {
      fetchResultFromServer('globeset', dateKey)
        .then((remote) => {
          if (cancelled || !remote) return;
          saveResult('globeset', dateKey, remote);
          setSavedResult(remote);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [dateKey, session.data]);

  useEffect(() => {
    completedRef.current = false;
    solverFromRef.current = undefined;
    setSelected([]);
    setHinted([]);
    setSolving([]);
    setSolverRunning(false);

    const saved = isToday ? loadRun(dateKey) : null;
    if (saved) {
      setRun({
        deck,
        board: saved.board,
        drawIndex: saved.drawIndex,
        boardSize: BOARD_SIZE,
        found: saved.found,
        misses: saved.misses,
        hints: saved.hints,
        solverUsed: saved.solverUsed,
        status: saved.board.length === 0 && saved.drawIndex >= deck.length ? 'complete' : 'playing',
      });
      bankedRef.current = saved.elapsedMs;
    } else {
      setRun(createRun(deck, BOARD_SIZE));
      bankedRef.current = 0;
    }
    runningSinceRef.current = Date.now();
    setElapsedMs(bankedRef.current);
  }, [dateKey, deck, isToday]);

  /* ── Autosave ──────────────────────────────────────────────────────────── */

  const snapshot = useCallback(() => {
    if (!isToday || savedResult) return;
    const state = runRef.current;
    if (state.status === 'complete') return;
    saveRun({
      dateKey,
      board: state.board,
      drawIndex: state.drawIndex,
      found: state.found,
      misses: state.misses,
      hints: state.hints,
      solverUsed: state.solverUsed,
      elapsedMs: readClock(),
    });
  }, [dateKey, isToday, readClock, savedResult]);

  useEffect(() => {
    const id = window.setInterval(snapshot, AUTOSAVE_MS);
    const onHide = () => snapshot();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      snapshot();
    };
  }, [snapshot]);

  /* ── Selection ─────────────────────────────────────────────────────────── */

  /**
   * Toggling a card decides three things at once — the new selection, whether
   * it claims a GlobeSet, and whether it just became a dead end — so all three
   * are computed HERE, from refs, and committed as plain event-handler
   * setState calls.
   *
   * They are emphatically not computed inside a `setSelected` updater. An
   * updater runs during the render phase, so a `setRun` inside one is a
   * render-phase update to a second piece of state: React re-runs the updater,
   * which submits the same GlobeSet again, and the component re-entered its own
   * lazy boundary and fell back to the loading spinner after exactly one claim.
   * Updaters stay pure.
   */
  const toggle = useCallback(
    (card: Card) => {
      if (locked) return;
      const state = runRef.current;
      // Drop anything the board no longer holds: a claim refills under the
      // exiting cards, and a click can land on one on its way out.
      const current = selectedRef.current.filter((c) => state.board.includes(c));
      if (!state.board.includes(card)) return;
      const next = current.includes(card) ? current.filter((c) => c !== card) : [...current, card];

      // Claim it the instant the colours all pair up.
      if (next.length > 0 && xorAll(next) === 0) {
        const indices = next.map((c) => state.board.indexOf(c));
        const result = submitSelection(state, indices, readClock());
        if (result.outcome === 'accepted') {
          setRun(result.state);
          setSelected([]);
          setHinted([]);
          setSolving([]);
          return;
        }
      }

      // A dead end is charged once, when the selection first stops being able
      // to reach a GlobeSet — never when the player picks further inside one.
      const toIndices = (cards: readonly Card[]) => cards.map((c) => state.board.indexOf(c));
      const wasViable = current.length === 0 || selectionIsViable(state.board, toIndices(current));
      const isViable = next.length === 0 || selectionIsViable(state.board, toIndices(next));
      if (wasViable && !isViable) setRun(recordDeadEnd(state));

      setSelected(next);
    },
    [locked, readClock],
  );

  const clearSelection = useCallback(() => setSelected([]), []);

  /* ── Hint ──────────────────────────────────────────────────────────────── */

  const hint = useCallback(() => {
    if (locked) return;
    const state = runRef.current;
    const indices = findSmallestGlobeSet(state.board);
    if (!indices) return;
    const cards = indices.map((i) => state.board[i]);
    // Each press reveals one more card of the same (smallest) GlobeSet, so the
    // first hint is a nudge and the fourth is the answer — the player chooses
    // how much help to buy.
    const reveal = Math.min(cards.length, hinted.length + 1);
    setHinted(cards.slice(0, reveal));
    setRun((s) => takeHint(s));
    toast.info(
      t('globeset-hint-toast', {
        defaultValue: 'Highlighted {{n}} of the cards in a GlobeSet.',
        n: reveal,
      }),
    );
  }, [hinted.length, locked, t]);

  // Keyboard: H takes a hint. The board owns 1–7 and Escape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        hint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hint]);

  /* ── The way out ───────────────────────────────────────────────────────── */

  const giveUp = useCallback(async () => {
    if (locked) return;
    const ok = await confirm({
      title: t('globeset-give-up-title', { defaultValue: 'Let the solver finish?' }),
      description: t('globeset-give-up-body', {
        defaultValue:
          'It will clear the rest of the deck for you, one GlobeSet at a time. The run stops counting for the leaderboard, but it still keeps your streak.',
      }),
      confirmLabel: t('globeset-give-up-confirm', { defaultValue: 'Solve it' }),
    });
    if (!ok) return;
    stopClock();
    solverFromRef.current = runRef.current.found.length;
    setSelected([]);
    setHinted([]);
    setSolverRunning(true);
  }, [confirm, locked, stopClock, t]);

  // The solver's playback. Each tick re-derives the smallest GlobeSet from the
  // live board rather than replaying a precomputed script, so a step can never
  // land on a board it was not computed for.
  useEffect(() => {
    if (!solverRunning) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const state = runRef.current;
      if (state.status === 'complete') {
        setSolving([]);
        setSolverRunning(false);
        return;
      }
      const indices = findSmallestGlobeSet(state.board);
      if (!indices) {
        setSolving([]);
        setSolverRunning(false);
        return;
      }
      setSolving(indices.map((i) => state.board[i]));
      window.setTimeout(() => {
        if (cancelled) return;
        setRun((s) => applySolverStep(s, indices, bankedRef.current));
        setSolving([]);
      }, SOLVER_STEP_MS * 0.55);
    };

    tick();
    const id = window.setInterval(tick, reduced ? 200 : SOLVER_STEP_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [solverRunning, reduced]);

  /* ── Landing a finished run ────────────────────────────────────────────── */

  const liveSummary = useMemo(
    () => summarise(run, dateKey, puzzleNumber, Math.round(elapsedMs / 1000)),
    [run, dateKey, puzzleNumber, elapsedMs],
  );

  /** A run stored earlier, rebuilt into the shape the results panel renders. */
  const storedSummary = useMemo<RunSummary | null>(() => {
    if (!savedResult) return null;
    const json = (savedResult.resultJson ?? {}) as {
      sizes?: number[];
      misses?: number;
      hints?: number;
      solverUsed?: boolean;
    };
    if (!Array.isArray(json.sizes)) return null;
    return {
      dateKey,
      puzzleNumber,
      timeSeconds: savedResult.timeSeconds ?? 0,
      sizes: json.sizes,
      misses: json.misses ?? 0,
      hints: json.hints ?? 0,
      solverUsed: json.solverUsed === true,
    };
  }, [savedResult, dateKey, puzzleNumber]);

  const summary = finished ? liveSummary : storedSummary;
  const points = useMemo(() => (summary ? scoreRun(summary) : 0), [summary]);
  const solverFrom =
    finished || !savedResult
      ? solverFromRef.current
      : ((savedResult.resultJson as { solverFrom?: number } | null)?.solverFrom ?? undefined);

  useEffect(() => {
    if (!finished || completedRef.current) return;
    completedRef.current = true;
    stopClock();
    clearRun();

    const timeSeconds = Math.round(readClock() / 1000);
    const final = summarise(runRef.current, dateKey, puzzleNumber, timeSeconds);
    const finalPoints = scoreRun(final);

    setStats(
      recordCompletion({
        dateKey,
        timeSeconds,
        globeSets: final.sizes.length,
        solverUsed: final.solverUsed,
      }),
    );

    // The hub reads the shared Daily Puzzles store, so the tile, the day's
    // point total and the cross-mode streak all pick this up without GlobeSet
    // knowing anything about them.
    saveResultWithSync(
      'globeset',
      dateKey,
      {
        puzzleDate: dateKey,
        score: finalPoints,
        timeSeconds,
        resultJson: {
          sizes: final.sizes,
          misses: final.misses,
          hints: final.hints,
          solverUsed: final.solverUsed,
          solverFrom: solverFromRef.current ?? null,
        },
        completedAt: new Date().toISOString(),
      },
      Boolean(session.data),
    );
    setSavedResult(getResult('globeset', dateKey));

    if (!final.solverUsed) void celebrate({ kind: 'fireworks' });
  }, [finished, celebrate, dateKey, puzzleNumber, readClock, session.data, stopClock]);

  const toggleShapes = useCallback(() => {
    setShapes((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(SHAPES_KEY, next ? '1' : '0');
      } catch {
        /* the toggle still works for this session */
      }
      return next;
    });
  }, []);

  const streak = useMemo(() => streakFrom(stats.playedDates, todayKey), [stats, todayKey]);

  /**
   * The gyroscope, held in a ref.
   *
   * `onRotate` fires once per animation frame; putting that in React state
   * would re-render this page sixty times a second. The globe's own frame loop
   * reads the ref, so the only thing React hears about is whether the sensor is
   * live at all.
   */
  const attitudeRef = useRef<Quat | null>(null);
  const onRotate = useCallback((rotation: Quat) => {
    attitudeRef.current = rotation;
  }, []);
  const onRest = useCallback(() => {
    attitudeRef.current = null;
  }, []);
  const tilt = useDeviceAttitude({ onRotate, onRest });
  const gyroActive = tilt.status === 'active' || tilt.status === 'waiting';

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      <header className="pt-2 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-site-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t('globeset-title', { defaultValue: 'GlobeSet' })}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-site-text sm:text-4xl">
          {t('globeset-headline', { defaultValue: 'Turn the globe' })}
        </h1>
        <p className="mt-2 text-sm text-site-text-muted">
          {dateKey} · {t('puzzle-number', { defaultValue: 'Puzzle #{{n}}', n: puzzleNumber })}
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {/* Boxed rather than left to fill the row: LiquidTabs' sheet is `w-full`,
            so on a desktop width two tabs stretch into a pair of half-page
            slabs and push the controls beside them onto their own line. */}
        <div className="w-full max-w-[16rem]">
          <LiquidTabs
            tabs={[
              { id: 'daily', label: t('globeset-tab-daily', { defaultValue: 'Daily' }) },
              { id: 'race', label: t('globeset-tab-race', { defaultValue: 'Race' }), icon: Swords },
            ]}
            value={tab}
            onChange={(id) => setTab(id as Tab)}
            size="sm"
            aria-label={t('globeset-tabs-label', { defaultValue: 'GlobeSet mode' })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={view === 'globe' ? 'accent-outline' : 'ghost'}
            size="sm"
            onClick={toggleView}
            aria-pressed={view === 'globe'}
          >
            {view === 'globe' ? (
              <Globe2 className="h-4 w-4" aria-hidden />
            ) : (
              <LayoutGrid className="h-4 w-4" aria-hidden />
            )}
            {view === 'globe'
              ? t('globeset-view-globe', { defaultValue: 'Globe' })
              : t('globeset-view-board', { defaultValue: 'Flat board' })}
          </Button>
          {/* Offered only where moving the device is actually the point — a
              touch device with a live sensor, outside reduced motion. */}
          {view === 'globe' && tilt.supported && (
            <Button
              type="button"
              variant={tilt.enabled ? 'accent-outline' : 'ghost'}
              size="sm"
              onClick={() => {
                if (tilt.enabled) {
                  void tilt.toggle();
                } else {
                  void tilt.toggle().then((status) => {
                    if (status === 'denied') {
                      toast.error(
                        t('globeset-gyro-denied', {
                          defaultValue:
                            'Motion access was declined — drag to turn the globe instead.',
                        }),
                      );
                    }
                  });
                }
              }}
              aria-pressed={tilt.enabled}
            >
              <Compass className="h-4 w-4" aria-hidden />
              {t('globeset-gyro', { defaultValue: 'Walk around it' })}
            </Button>
          )}
          {/* Shown only where an immersive-ar session can actually start, so
              it is never a button that fails on press. */}
          {view === 'globe' && arAvailable && !summary && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setInRoom(true)}>
              <Box className="h-4 w-4" aria-hidden />
              {t('globeset-ar-enter', { defaultValue: 'View in your room' })}
            </Button>
          )}
          <Button
            type="button"
            variant={shapes ? 'accent-outline' : 'ghost'}
            size="sm"
            onClick={toggleShapes}
            aria-pressed={shapes}
          >
            <Shapes className="h-4 w-4" aria-hidden />
            {t('globeset-shapes', { defaultValue: 'Distinct shapes' })}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRulesOpen(true)}>
            <HelpCircle className="h-4 w-4" aria-hidden />
            {t('globeset-how-to-play', { defaultValue: 'How to play' })}
          </Button>
        </div>
      </div>

      {tab === 'race' ? (
        <GlobeSetRace
          shapes={shapes}
          view={view}
          attitudeRef={attitudeRef}
          gyroActive={gyroActive}
        />
      ) : (
        <>
          {!summary && (
            <div className="mt-5">
              <GlobeSetHud
                elapsedSeconds={Math.round(elapsedMs / 1000)}
                progress={runProgress(run)}
                cardsLeft={cardsRemaining(run)}
                globeSets={run.found.length}
                hints={run.hints}
                locked={locked}
                onHint={hint}
                onGiveUp={giveUp}
              />
            </div>
          )}

          <div className="mt-5">
            <AnimatePresence mode="wait" initial={false}>
              {summary ? (
                <motion.div
                  key="done"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <GlobeSetResults
                    summary={summary}
                    points={points}
                    stats={stats}
                    streak={streak}
                    solverFrom={solverFrom}
                    dateKey={dateKey}
                    isToday={isToday}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="board"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {view === 'globe' ? (
                    <GlobeSetGlobe
                      board={run.board}
                      selected={selected}
                      hinted={hinted}
                      solving={solving}
                      locked={locked}
                      shapes={shapes}
                      attitudeRef={attitudeRef}
                      gyroActive={gyroActive}
                      onToggle={toggle}
                      onClear={clearSelection}
                    />
                  ) : (
                    <GlobeSetBoard
                      board={run.board}
                      selected={selected}
                      hinted={hinted}
                      solving={solving}
                      locked={locked}
                      shapes={shapes}
                      onToggle={toggle}
                      onClear={clearSelection}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <PastPuzzlesSection
            gameMode="globeset"
            selectedDateKey={dateKey}
            onSelectDate={setDateKey}
          />
        </>
      )}

      {inRoom && (
        <Suspense fallback={null}>
          <GlobeSetXr
            board={run.board}
            selected={selected}
            hinted={hinted}
            shapes={shapes}
            elapsedSeconds={Math.round(elapsedMs / 1000)}
            cardsLeft={cardsRemaining(run)}
            sets={run.found.length}
            onToggle={toggle}
            onExit={() => setInRoom(false)}
          />
        </Suspense>
      )}

      <GlobeSetRules open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  );
}
