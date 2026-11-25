/**
 * Undo and redo for the Studio document (pure; the store wires it to its mutators).
 *
 * The document is exactly what a saved project holds (`project-schema.ts`): tracks, clips, notes (inside clips),
 * patterns, tempo, time signature and master volume. View state, transport, selection and the loop region are not
 * saved with a project, so they are not history either. A snapshot is the slice of references the store already
 * holds: every store update is immutable, so a step shares everything it did not change and copies nothing.
 *
 * A step is stored as the document BEFORE the change. Continuous gestures (a fader drag, a clip drag, nudging notes
 * with the keyboard) arrive as many tiny changes with the same label; they stay in one pending step until the
 * gesture ends or 400 ms pass without another change, and only then does the step land on the undo stack.
 */
import type { Clip, Pattern, Track } from '@/lib/studio/types';

/** The most steps kept; the oldest fall off the bottom. */
export const MAX_HISTORY_STEPS = 100;
/** A keyboard-driven change commits this long after the last change of the same kind. */
export const COALESCE_MS = 400;

/** The document slice. */
export interface DocSlice {
  bpm: number;
  timeSignature: [number, number];
  tracks: Track[];
  clips: Record<string, Clip>;
  patterns: Pattern[];
  masterVolume: number;
}

/** Fixed step names; the UI maps each to a literal translated string. */
export type HistoryLabel =
  | 'add-track'
  | 'delete-track'
  | 'edit-track'
  | 'reorder-tracks'
  | 'add-clip'
  | 'delete-clip'
  | 'move-clip'
  | 'edit-clip'
  | 'edit-notes'
  | 'add-pattern'
  | 'delete-pattern'
  | 'edit-pattern'
  | 'master-volume'
  | 'track-volume'
  | 'track-pan'
  | 'track-mute'
  | 'track-solo'
  | 'track-arm'
  | 'tempo'
  | 'time-signature'
  | 'paste'
  | 'cut'
  | 'delete-selection'
  | 'duplicate'
  | 'transpose'
  | 'shift-notes'
  | 'import-midi'
  | 'record-take';

export interface HistoryStep {
  label: HistoryLabel;
  /** The document to restore when this step is undone (or redone). */
  doc: DocSlice;
}

interface Pending {
  label: HistoryLabel;
  base: DocSlice;
  lastAt: number;
}

export interface History {
  /** Oldest first. */
  past: HistoryStep[];
  /** Next redo last. */
  future: HistoryStep[];
  /** A gesture still collecting changes; counts as the top of `past`. */
  pending: Pending | null;
}

export const createHistory = (): History => ({
  past: [],
  future: [],
  pending: null,
});

/** The document slice of any object that carries it (the store state). */
export function selectDoc(s: DocSlice): DocSlice {
  return {
    bpm: s.bpm,
    timeSignature: s.timeSignature,
    tracks: s.tracks,
    clips: s.clips,
    patterns: s.patterns,
    masterVolume: s.masterVolume,
  };
}

/** Reference equality part by part: store updates are immutable, so an unchanged part is the same reference. */
export function docEqual(a: DocSlice, b: DocSlice): boolean {
  return (
    a.bpm === b.bpm &&
    a.timeSignature === b.timeSignature &&
    a.tracks === b.tracks &&
    a.clips === b.clips &&
    a.patterns === b.patterns &&
    a.masterVolume === b.masterVolume
  );
}

function pushPast(past: HistoryStep[], step: HistoryStep): HistoryStep[] {
  const next = [...past, step];
  return next.length > MAX_HISTORY_STEPS ? next.slice(next.length - MAX_HISTORY_STEPS) : next;
}

/** Move the pending gesture, if any, onto the undo stack. */
export function flush(h: History): History {
  if (!h.pending) return h;
  return {
    ...h,
    past: pushPast(h.past, {
      label: h.pending.label,
      doc: h.pending.base,
    }),
    pending: null,
  };
}

/**
 * Record that the document changed away from `before`. `coalesce` marks a continuous change: it joins the pending
 * step when the label matches and the last change was at most 400 ms ago. Any new change empties the redo stack.
 */
export function commit(h: History, label: HistoryLabel, before: DocSlice, now: number, coalesce: boolean): History {
  const p = h.pending;
  if (coalesce && p && p.label === label && now - p.lastAt <= COALESCE_MS) {
    return {
      ...h,
      future: [],
      pending: {
        ...p,
        lastAt: now,
      },
    };
  }
  const flushed = flush(h);
  if (coalesce)
    return {
      ...flushed,
      future: [],
      pending: {
        label,
        base: before,
        lastAt: now,
      },
    };
  return {
    past: pushPast(flushed.past, {
      label,
      doc: before,
    }),
    future: [],
    pending: null,
  };
}

/** True when the pending gesture has been quiet for the coalescing window. */
export const pendingExpired = (h: History, now: number): boolean =>
  h.pending !== null && now - h.pending.lastAt >= COALESCE_MS;

export const canUndo = (h: History): boolean => h.pending !== null || h.past.length > 0;
export const canRedo = (h: History): boolean => h.future.length > 0;

/** The step Undo would revert, or null. */
export function undoLabel(h: History): HistoryLabel | null {
  if (h.pending) return h.pending.label;
  return h.past[h.past.length - 1]?.label ?? null;
}

/** The step Redo would reapply, or null. */
export const redoLabel = (h: History): HistoryLabel | null => h.future[h.future.length - 1]?.label ?? null;

export interface HistoryMove {
  history: History;
  /** The document to put in the store. */
  doc: DocSlice;
  label: HistoryLabel;
}

/** Revert the latest step; `current` is the document as it is now (it becomes the redo target). */
export function undo(h: History, current: DocSlice): HistoryMove | null {
  const f = flush(h);
  const step = f.past[f.past.length - 1];
  if (!step) return null;
  return {
    history: {
      past: f.past.slice(0, -1),
      future: [
        ...f.future,
        {
          label: step.label,
          doc: current,
        },
      ],
      pending: null,
    },
    doc: step.doc,
    label: step.label,
  };
}

/** Reapply the latest undone step. */
export function redo(h: History, current: DocSlice): HistoryMove | null {
  const f = flush(h);
  const step = f.future[f.future.length - 1];
  if (!step) return null;
  return {
    history: {
      past: pushPast(f.past, {
        label: step.label,
        doc: current,
      }),
      future: f.future.slice(0, -1),
      pending: null,
    },
    doc: step.doc,
    label: step.label,
  };
}

/** Number of steps that can be undone (pending included). */
export const depth = (h: History): number => h.past.length + (h.pending ? 1 : 0);
