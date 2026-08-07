'use client';

/**
 * Slice It chart editor — the editor store.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §3.
 *
 * One store, separate from `useSliceItStore` — the game store persists settings
 * and holds run state, and mixing an undo stack into it would put a 200-entry
 * command history behind the same `partialize` that writes keybinds to disk.
 */

import { create } from 'zustand';
import { DIFFICULTIES } from '@/lib/slice-it/constants';
import type { EditorArtefacts } from './artefacts';
import type { Command } from './commands';
import type { GeneratePlan } from './generate';
import { EMPTY_LINT, type LintResult } from './lint';
import { singleTimingPoint } from './types';
import type {
  Charts,
  Difficulty,
  EditorChart,
  EditorNote,
  EditorTool,
  NestingMode,
  SliceType,
  SnapDivision,
  SvPoint,
  TimingPoint,
} from './types';

/** 200 deep, per §5.2. Past that the oldest step falls off the bottom. */
const HISTORY_LIMIT = 200;

/** Pixels per second at zoom 1. The whole zoom range is a multiple of this. */
export const BASE_PIXELS_PER_SECOND = 260;
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 6;

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface EditorSong {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm: number;
  audioUrl: string;
}

export interface EditorLoadPayload {
  song: EditorSong;
  keys: number;
  charts: Charts;
  chartIds: Record<Difficulty, string | null>;
  chartStatus: Record<Difficulty, string>;
  timingPoints: TimingPoint[];
  svPoints: SvPoint[];
}

interface EditorState {
  /* ── Document ─────────────────────────────────────────────────────────── */
  song: EditorSong | null;
  keys: number;
  chartIds: Record<Difficulty, string | null>;
  /** `'draft' | 'public'` per difficulty — the publish gate's other half (§9). */
  chartStatus: Record<Difficulty, string>;
  /**
   * All four difficulties, always. The nesting invariant (§7.2) is a
   * cross-difficulty property, so the editor cannot hold one at a time.
   */
  charts: Charts;
  active: Difficulty;
  timingPoints: TimingPoint[];
  svPoints: SvPoint[];

  /* ── Lifecycle ────────────────────────────────────────────────────────── */
  loadState: LoadState;
  error: string | null;
  saving: boolean;
  lastSavedAt: number | null;

  /* ── View ─────────────────────────────────────────────────────────────── */
  /**
   * Seconds at the playhead. The single source of truth for scroll — the
   * timeline derives its window from this, never the other way round.
   */
  playhead: number;
  /** Multiplier on {@link BASE_PIXELS_PER_SECOND}. */
  zoom: number;
  playing: boolean;
  playbackRate: number;
  /** Loop markers for A/B practice inside the editor (P1's mechanism). Phase 4. */
  loop: { start: number; end: number } | null;
  /**
   * True while the real `GameEngine` is playing the working chart (§10).
   *
   * A flag rather than the session itself: the session is a module singleton in
   * `playtest.ts` (the draw loop reads it every frame and must not re-render to
   * do so), and what the React tree needs from it is only "is one running".
   */
  playtesting: boolean;

  /* ── Generation ───────────────────────────────────────────────────────── */
  /**
   * The proposed result of a regenerate, uncommitted (§8.3).
   *
   * Preview before apply, always: the timeline draws this plan's additions in
   * green and its removals struck through, and nothing reaches `charts` until
   * Apply. A regenerate that silently ate an author's work once is a feature they
   * will never press again.
   */
  preview: GeneratePlan | null;

  /* ── Analysis artefacts (§6) ──────────────────────────────────────────── */
  /**
   * Waveform envelope, onset ghosts and sections, once fetched.
   *
   * Null until the fetch lands, and it stays null for a song analysed before
   * artefacts were persisted — every consumer draws nothing rather than
   * blocking, because the editor has to work on the back catalogue.
   */
  artefacts: EditorArtefacts | null;
  /** Ghost onsets hidden — they are dense, and sometimes you want the chart. */
  showGhosts: boolean;

  /* ── Lint (§9) ────────────────────────────────────────────────────────── */
  /**
   * The last lint result, carrying the `revision` it was computed from.
   *
   * Held in the store rather than in the panel so the timeline can ring a bad
   * note and the difficulty tabs can badge a bad tier without the panel being
   * open — a chart is not less broken because you closed the drawer.
   *
   * Deliberately NOT written onto the notes themselves: notes are replaced by
   * reference on every command (that is how `markSaved` detects a race), and
   * decorating them with issues would make every lint run look like an edit and
   * schedule an autosave.
   */
  lint: LintResult;
  /** Which lint finding the author is currently looking at, if any. */
  lintFocus: { code: string; time: number } | null;

  /* ── Tools ────────────────────────────────────────────────────────────── */
  tool: EditorTool;
  snap: SnapDivision;
  /**
   * Off lets you place a note anywhere. On by default: off-grid notes are the
   * single most common way a hand-edited chart stops feeling like the song, and
   * the generator drops them for exactly that reason.
   */
  snapEnabled: boolean;
  placeType: SliceType;
  nestingMode: NestingMode;

  /* ── History ──────────────────────────────────────────────────────────── */
  undoStack: Command[];
  redoStack: Command[];
  /**
   * Bumped on every mutation. The autosave loop watches this rather than
   * deep-comparing the note list every tick.
   */
  revision: number;
  lastSavedRevision: number;

  /* ── Actions ──────────────────────────────────────────────────────────── */
  load: (payload: EditorLoadPayload) => void;
  fail: (message: string) => void;
  apply: (command: Command | null, options?: { merge?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  setActive: (difficulty: Difficulty) => void;
  setPlayhead: (seconds: number) => void;
  setZoom: (zoom: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setLoop: (loop: { start: number; end: number } | null) => void;
  setPlaytesting: (playtesting: boolean) => void;
  setPreview: (preview: GeneratePlan | null) => void;
  setTimingPoints: (points: TimingPoint[]) => void;
  setSvPoints: (points: SvPoint[]) => void;
  setArtefacts: (artefacts: EditorArtefacts | null) => void;
  setShowGhosts: (show: boolean) => void;
  setLint: (lint: LintResult) => void;
  setLintFocus: (focus: { code: string; time: number } | null) => void;
  setChartStatus: (difficulty: Difficulty, status: string) => void;
  setTool: (tool: EditorTool) => void;
  setSnap: (snap: SnapDivision) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setPlaceType: (type: SliceType) => void;
  setNestingMode: (mode: NestingMode) => void;
  setSelection: (ids: readonly string[], mode?: 'replace' | 'add' | 'toggle') => void;
  clearSelection: () => void;
  selectAll: () => void;
  setSaving: (saving: boolean) => void;
  /**
   * Record that the document as of `revision` reached the server.
   *
   * `saved` maps each difficulty that was written to the exact note array that
   * was sent. A chart is only marked clean when its notes are still that array —
   * an edit that landed WHILE the request was in flight replaced the reference,
   * and clearing its `dirty` flag would drop that edit on the floor: the next
   * autosave would find nothing pending and mark the whole document saved.
   */
  markSaved: (revision: number, saved: Partial<Record<Difficulty, readonly EditorNote[]>>) => void;
  reset: () => void;
}

export function emptyChart(difficulty: Difficulty, keys = 2): EditorChart {
  return {
    difficulty,
    keys,
    name: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
    notes: [],
    dirty: false,
    rating: null,
  };
}

export function emptyCharts(keys = 2): Charts {
  return {
    easy: emptyChart('easy', keys),
    normal: emptyChart('normal', keys),
    hard: emptyChart('hard', keys),
    expert: emptyChart('expert', keys),
  };
}

const initial = {
  song: null,
  keys: 2,
  chartIds: { easy: null, normal: null, hard: null, expert: null } as Record<
    Difficulty,
    string | null
  >,
  chartStatus: { easy: 'draft', normal: 'draft', hard: 'draft', expert: 'draft' } as Record<
    Difficulty,
    string
  >,
  charts: emptyCharts(),
  active: 'normal' as Difficulty,
  timingPoints: singleTimingPoint(120),
  svPoints: [] as SvPoint[],
  loadState: 'idle' as LoadState,
  error: null as string | null,
  saving: false,
  lastSavedAt: null as number | null,
  playhead: 0,
  zoom: 1,
  playing: false,
  playbackRate: 1,
  loop: null,
  playtesting: false,
  preview: null as GeneratePlan | null,
  artefacts: null as EditorArtefacts | null,
  showGhosts: true,
  lint: EMPTY_LINT,
  lintFocus: null as { code: string; time: number } | null,
  tool: 'select' as EditorTool,
  snap: 4 as SnapDivision,
  snapEnabled: true,
  placeType: 'STANDARD' as SliceType,
  nestingMode: 'cascade' as NestingMode,
  undoStack: [] as Command[],
  redoStack: [] as Command[],
  revision: 0,
  lastSavedRevision: 0,
};

/** Rewrite `selected` across the active chart without touching `dirty`. */
function reselect(
  charts: Charts,
  difficulty: Difficulty,
  next: (note: EditorNote) => boolean,
): Charts {
  const chart = charts[difficulty];
  let changed = false;
  const notes = chart.notes.map((note) => {
    const selected = next(note);
    if (Boolean(note.selected) === selected) return note;
    changed = true;
    return selected ? { ...note, selected: true } : { ...note, selected: false };
  });
  if (!changed) return charts;
  // Deliberately NOT `withNotes`: selection is view state. Marking the chart
  // dirty here would make clicking a note schedule an autosave.
  return { ...charts, [difficulty]: { ...chart, notes } };
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...initial,

  load: (payload) =>
    set({
      song: payload.song,
      keys: payload.keys,
      charts: payload.charts,
      chartIds: payload.chartIds,
      chartStatus: payload.chartStatus,
      timingPoints:
        payload.timingPoints.length > 0
          ? payload.timingPoints
          : singleTimingPoint(payload.song.bpm),
      svPoints: payload.svPoints,
      loadState: 'ready',
      error: null,
      undoStack: [],
      redoStack: [],
      revision: 0,
      lastSavedRevision: 0,
      playhead: 0,
      // Revisions restart at 0 for a new document, so a stale result from the
      // previous one would out-rank every result this document produces and the
      // panel would show another song's findings forever.
      lint: EMPTY_LINT,
      lintFocus: null,
      artefacts: null,
    }),

  fail: (message) => set({ loadState: 'error', error: message }),

  /**
   * Every mutation goes through here. Nothing sets `charts` directly.
   *
   * That is the whole reason undo works: a command knows how to invert itself,
   * so the stack holds intentions rather than snapshots. Snapshotting 1200 notes
   * on every note placement would be 90 KB per keystroke.
   *
   * `merge` is what a drag passes. The state still advances by the incremental
   * command; only the STACK ENTRY is replaced by the merged one, whose inverse
   * lands back where the gesture started.
   */
  apply: (command, options) =>
    set((state) => {
      if (!command) return state;
      const charts = command.apply(state.charts);
      const previous = state.undoStack.at(-1);
      const merged = options?.merge && previous ? (command.mergeWith?.(previous) ?? null) : null;
      const undoStack = merged
        ? [...state.undoStack.slice(0, -1), merged]
        : [...state.undoStack, command].slice(-HISTORY_LIMIT);
      // Any edit invalidates a pending preview: the plan was computed against the
      // chart as it was, so applying it afterwards would silently revert the edit
      // that has just landed.
      return { charts, undoStack, redoStack: [], revision: state.revision + 1, preview: null };
    }),

  undo: () =>
    set((state) => {
      const command = state.undoStack.at(-1);
      if (!command) return state;
      return {
        charts: command.invert(state.charts),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
        revision: state.revision + 1,
        preview: null,
      };
    }),

  redo: () =>
    set((state) => {
      const command = state.redoStack.at(-1);
      if (!command) return state;
      return {
        charts: command.apply(state.charts),
        undoStack: [...state.undoStack, command],
        redoStack: state.redoStack.slice(0, -1),
        revision: state.revision + 1,
        preview: null,
      };
    }),

  setActive: (difficulty) => set({ active: difficulty }),
  setPlayhead: (seconds) =>
    set((state) => ({
      playhead: Math.max(0, Math.min(state.song?.duration ?? Number.MAX_SAFE_INTEGER, seconds)),
    })),
  setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),
  setPlaying: (playing) => set({ playing }),
  setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.25, Math.min(2, rate)) }),
  setLoop: (loop) =>
    set(
      loop && loop.end > loop.start
        ? { loop: { start: loop.start, end: loop.end } }
        : { loop: null },
    ),
  setPlaytesting: (playtesting) => set({ playtesting }),
  setPreview: (preview) => set({ preview }),
  /**
   * Timing and SV edits (§4.2, phase 8).
   *
   * They mark every difficulty dirty, not just the open one: the timing map is
   * a property of the SONG, but it is stored on each `Chart` row, so a change
   * that only saved the open tier would leave the other three describing a grid
   * that no longer exists. They deliberately do NOT go through the command
   * stack — undo operates on notes, and a timing map that could be undone
   * independently of the notes snapped to it is a chart that silently comes
   * apart. The request to extend the stack to cover them is in
   * `docs/_handoff/editor-phase678-requests.md`.
   */
  setTimingPoints: (timingPoints) =>
    set((state) => ({
      timingPoints,
      charts: markAllDirty(state.charts),
      revision: state.revision + 1,
    })),
  setSvPoints: (svPoints) =>
    set((state) => ({
      svPoints,
      charts: markAllDirty(state.charts),
      revision: state.revision + 1,
    })),
  setArtefacts: (artefacts) => set({ artefacts }),
  setShowGhosts: (showGhosts) => set({ showGhosts }),
  /**
   * A result older than the one already held is dropped.
   *
   * The runner coalesces, but a worker message and a `flush()` on the main
   * thread can still cross: without this, clicking Publish (which flushes) and
   * then receiving the older worker reply would restore the findings the flush
   * had just superseded, and the button would flicker between enabled and not.
   */
  setLint: (lint) => set((state) => (lint.revision < state.lint.revision ? state : { lint })),
  setLintFocus: (lintFocus) => set({ lintFocus }),
  setChartStatus: (difficulty, status) =>
    set((state) => ({ chartStatus: { ...state.chartStatus, [difficulty]: status } })),
  setTool: (tool) => set({ tool }),
  setSnap: (snap) => set({ snap }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setPlaceType: (placeType) => set({ placeType }),
  setNestingMode: (nestingMode) => set({ nestingMode }),

  setSelection: (ids, mode = 'replace') =>
    set((state) => {
      const set_ = new Set(ids);
      const predicate =
        mode === 'replace'
          ? (note: EditorNote) => set_.has(note.id)
          : mode === 'add'
            ? (note: EditorNote) => set_.has(note.id) || Boolean(note.selected)
            : (note: EditorNote) => (set_.has(note.id) ? !note.selected : Boolean(note.selected));
      return { charts: reselect(state.charts, state.active, predicate) };
    }),

  clearSelection: () =>
    set((state) => ({ charts: reselect(state.charts, state.active, () => false) })),
  selectAll: () => set((state) => ({ charts: reselect(state.charts, state.active, () => true) })),

  setSaving: (saving) => set({ saving }),
  markSaved: (revision, saved) =>
    set((state) => ({
      lastSavedRevision: revision,
      lastSavedAt: Date.now(),
      saving: false,
      charts: markClean(state.charts, saved),
    })),

  reset: () => set({ ...initial, charts: emptyCharts() }),
}));

/** Every tier dirty — see `setTimingPoints`. */
function markAllDirty(charts: Charts): Charts {
  const out = { ...charts };
  for (const difficulty of DIFFICULTIES) {
    if (!out[difficulty].dirty) out[difficulty] = { ...out[difficulty], dirty: true };
  }
  return out;
}

function markClean(
  charts: Charts,
  saved: Partial<Record<Difficulty, readonly EditorNote[]>>,
): Charts {
  const out = { ...charts };
  for (const difficulty of DIFFICULTIES) {
    const sent = saved[difficulty];
    if (!sent) continue;
    // Reference equality, not deep: the command stack replaces the array on
    // every mutation, so an unchanged reference is exactly "nothing landed here
    // since the request left".
    if (out[difficulty].notes !== sent) continue;
    if (out[difficulty].dirty) out[difficulty] = { ...out[difficulty], dirty: false };
  }
  return out;
}

/** Non-reactive read, matching `sliceItState()` in the game store. */
export const editorState = () => useEditorStore.getState();

/** The notes currently selected on the active difficulty. */
export function selectedNotes(state: Pick<EditorState, 'charts' | 'active'>): EditorNote[] {
  return state.charts[state.active].notes.filter((note) => note.selected);
}
