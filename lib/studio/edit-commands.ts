/**
 * The edit commands the keybinds and toolbar call: undo, redo, copy, cut, paste, delete, duplicate, select all,
 * and transposing or shifting the selected notes. They read and write `useStudioStore`; each command that changes
 * the document is exactly one history step (`runStep`).
 */
import { useJamStore } from '@/lib/studio/jam/store';
import {
  parseClipboard,
  placeClips,
  placeNotes,
  serializeClipboard,
  type ClipboardPayload,
} from '@/lib/studio/clipboard';
import { canRedo, canUndo, redoLabel, undoLabel, type HistoryLabel } from '@/lib/studio/history';
import { useStudioStore, type StudioStore } from '@/lib/studio/store';
import type { Clip, MidiClipData, MidiNote } from '@/lib/studio/types';

const MIDI_MIN = 0;
const MIDI_MAX = 127;
const store = () => useStudioStore.getState();
const newId = (): string => crypto.randomUUID();

/** The copy made in this tab; the system clipboard carries the same text so another tab can paste it. */
let memoryClipboard: ClipboardPayload | null = null;
export const getMemoryClipboard = (): ClipboardPayload | null => memoryClipboard;
export const clearMemoryClipboard = (): void => {
  memoryClipboard = null;
};

// ─── Undo and redo ──────────────────────────────────────────────────────────

export interface HistoryAvailability {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: HistoryLabel | null;
  redoLabel: HistoryLabel | null;
  /** Why Undo and Redo are off regardless of history: a connected jam. */
  blocked: 'jam' | null;
}

export function historyAvailability(s: Pick<StudioStore, 'history'> = store()): HistoryAvailability {
  const blocked = useJamStore.getState().status !== 'off' ? 'jam' : null;
  return {
    blocked,
    canUndo: !blocked && canUndo(s.history),
    canRedo: !blocked && canRedo(s.history),
    undoLabel: undoLabel(s.history),
    redoLabel: redoLabel(s.history),
  };
}

export function undoCommand(): boolean {
  if (!historyAvailability().canUndo) return false;
  store().undo();
  return true;
}

export function redoCommand(): boolean {
  if (!historyAvailability().canRedo) return false;
  store().redo();
  return true;
}

// ─── Selection helpers ──────────────────────────────────────────────────────

function openMidiClip(s: StudioStore): MidiClipData | null {
  const c = s.pianoRollClipId ? s.clips[s.pianoRollClipId] : undefined;
  return c && c.type === 'midi' ? c : null;
}

/** Notes are the target when the piano roll is the active view and a MIDI clip is open in it. */
function noteTarget(s: StudioStore): {
  clip: MidiClipData;
  notes: MidiNote[];
} | null {
  if (s.activeView !== 'pianoRoll') return null;
  const clip = openMidiClip(s);
  if (!clip) return null;
  const ids = new Set(s.selectedNoteIds);
  return {
    clip,
    notes: clip.notes.filter((n) => ids.has(n.id)),
  };
}

function selectedClips(s: StudioStore): Clip[] {
  return s.selectedClipIds.map((id) => s.clips[id]).filter((c): c is Clip => Boolean(c));
}

// ─── Copy, cut, paste ───────────────────────────────────────────────────────

function currentPayload(): ClipboardPayload | null {
  const s = store();
  const nt = noteTarget(s);
  if (nt)
    return nt.notes.length > 0
      ? {
          kind: 'notes',
          notes: nt.notes,
        }
      : null;
  const clips = selectedClips(s);
  return clips.length > 0
    ? {
        kind: 'clips',
        clips,
      }
    : null;
}

/** Put the selection on the clipboard; returns the text for the system clipboard, or null with nothing selected. */
export function copySelection(): string | null {
  const payload = currentPayload();
  if (!payload) return null;
  memoryClipboard = payload;
  return serializeClipboard(payload);
}

export function deleteSelection(label: HistoryLabel = 'delete-selection'): boolean {
  const s = store();
  const nt = noteTarget(s);
  if (nt) {
    if (nt.notes.length === 0) return false;
    const gone = new Set(nt.notes.map((n) => n.id));
    s.runStep(label, () =>
      s.updateClip(nt.clip.id, {
        notes: nt.clip.notes.filter((n) => !gone.has(n.id)),
      } as Partial<Clip>),
    );
    s.selectNotes([]);
    return true;
  }
  const clips = selectedClips(s);
  if (clips.length === 0) return false;
  s.runStep(label, () => {
    for (const c of clips) s.removeClip(c.id);
  });
  s.selectClips([]);
  return true;
}

/** Cut returns the text for the system clipboard (or null when nothing was selected). */
export function cutSelection(): string | null {
  const text = copySelection();
  if (text === null) return null;
  deleteSelection('cut');
  return text;
}

/**
 * Paste. `text` is the system clipboard when the browser let us read it: our payload is used, anything else is
 * ignored silently. With no text (unreadable clipboard) the copy made in this tab is used.
 */
export function pasteFromText(text: string | null): boolean {
  const payload = text === null ? memoryClipboard : parseClipboard(text);
  if (!payload) return false;
  const s = store();
  if (payload.kind === 'notes') {
    const clip = openMidiClip(s);
    if (!clip) return false;
    const added = placeNotes(payload.notes, clip.startBeat, s.currentBeat, newId);
    const end = Math.max(...added.map((n) => n.startBeat + n.durationBeats));
    s.runStep('paste', () =>
      s.updateClip(clip.id, {
        notes: [...clip.notes, ...added],
        durationBeats: Math.max(clip.durationBeats, end),
      } as Partial<Clip>),
    );
    s.selectNotes(added.map((n) => n.id));
    return true;
  }
  const placed = placeClips(payload.clips, {
    playheadBeat: s.currentBeat,
    selectedTrackId: s.selectedTrackId,
    tracks: s.tracks,
    newId,
  });
  if (placed.length === 0) return false;
  s.runStep('paste', () => {
    for (const c of placed) s.addClip(c);
  });
  s.selectClips(placed.map((c) => c.id));
  return true;
}

/** Read the system clipboard when allowed (a refusal falls back to this tab's copy) and paste. */
export async function pasteCommand(): Promise<boolean> {
  let text: string | null = null;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) text = await navigator.clipboard.readText();
  } catch {
    text = null;
  }
  return pasteFromText(text);
}

/** Copy to the system clipboard too, so another Studio tab can paste. Failure is silent: this tab still has it. */
export function writeSystemClipboard(text: string | null): void {
  if (text === null || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
  navigator.clipboard.writeText(text).catch(() => undefined);
}

// ─── Duplicate and select all ───────────────────────────────────────────────

/** Duplicates land right after the selection, keeping their spacing and their own tracks. */
export function duplicateSelection(): boolean {
  const s = store();
  const nt = noteTarget(s);
  if (nt) {
    if (nt.notes.length === 0) return false;
    const start = Math.min(...nt.notes.map((n) => n.startBeat));
    const end = Math.max(...nt.notes.map((n) => n.startBeat + n.durationBeats));
    const added = nt.notes.map((n) => ({
      ...n,
      id: newId(),
      startBeat: n.startBeat + (end - start),
    }));
    const newEnd = Math.max(...added.map((n) => n.startBeat + n.durationBeats));
    s.runStep('duplicate', () =>
      s.updateClip(nt.clip.id, {
        notes: [...nt.clip.notes, ...added],
        durationBeats: Math.max(nt.clip.durationBeats, newEnd),
      } as Partial<Clip>),
    );
    s.selectNotes(added.map((n) => n.id));
    return true;
  }
  const clips = selectedClips(s);
  if (clips.length === 0) return false;
  const start = Math.min(...clips.map((c) => c.startBeat));
  const end = Math.max(...clips.map((c) => c.startBeat + c.durationBeats));
  const copies = clips.map((c) => {
    const base = {
      ...c,
      id: newId(),
      startBeat: c.startBeat + (end - start),
    };
    return base.type === 'midi'
      ? {
          ...base,
          notes: base.notes.map((n) => ({
            ...n,
            id: newId(),
          })),
        }
      : base;
  });
  s.runStep('duplicate', () => {
    for (const c of copies) s.addClip(c);
  });
  s.selectClips(copies.map((c) => c.id));
  return true;
}

export function selectAll(): void {
  const s = store();
  const clip = s.activeView === 'pianoRoll' ? openMidiClip(s) : null;
  if (clip) s.selectNotes(clip.notes.map((n) => n.id));
  else s.selectClips(Object.keys(s.clips));
}

// ─── Transpose and shift ────────────────────────────────────────────────────

/**
 * Move the selected notes by `semitones`, as one step. The whole group stops at the edge of the MIDI range rather
 * than squashing a chord: the move is limited so the highest note stays at 127 or lower and the lowest at 0 or above.
 */
export function transposeSelection(semitones: number): boolean {
  const s = store();
  const nt = noteTarget(s);
  if (!nt || nt.notes.length === 0) return false;
  const lo = Math.min(...nt.notes.map((n) => n.pitch));
  const hi = Math.max(...nt.notes.map((n) => n.pitch));
  const delta = Math.max(MIDI_MIN - lo, Math.min(MIDI_MAX - hi, semitones));
  if (delta === 0) return false;
  mapSelectedNotes(nt, 'transpose', (n) => ({
    ...n,
    pitch: n.pitch + delta,
  }));
  return true;
}

/** Move the selected notes by `beats` (negative is earlier); the earliest note never goes before beat 0. */
export function shiftSelection(beats: number): boolean {
  const s = store();
  const nt = noteTarget(s);
  if (!nt || nt.notes.length === 0) return false;
  const first = Math.min(...nt.notes.map((n) => n.startBeat));
  const delta = Math.max(-first, beats);
  if (delta === 0) return false;
  mapSelectedNotes(nt, 'shift-notes', (n) => ({
    ...n,
    startBeat: n.startBeat + delta,
  }));
  return true;
}

/** One snap step in beats, the unit the shift keybinds move by. */
export function shiftStep(s: Pick<StudioStore, 'snapValue'> = store()): number {
  return s.snapValue > 0 ? s.snapValue : 0.25;
}

function mapSelectedNotes(
  nt: {
    clip: MidiClipData;
    notes: MidiNote[];
  },
  label: HistoryLabel,
  fn: (n: MidiNote) => MidiNote,
): void {
  const ids = new Set(nt.notes.map((n) => n.id));
  const notes = nt.clip.notes.map((n) => (ids.has(n.id) ? fn(n) : n));
  const end = Math.max(...notes.map((n) => n.startBeat + n.durationBeats));
  const s = store();
  s.runStep(label, () =>
    s.updateClip(nt.clip.id, {
      notes,
      durationBeats: Math.max(nt.clip.durationBeats, end),
    } as Partial<Clip>),
  );
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

/** Run an edit or piano-roll keybind action id; false when the id is not one of ours. */
export function runEditAction(actionId: string): boolean {
  switch (actionId) {
    case 'edit.undo':
      undoCommand();
      return true;
    case 'edit.redo':
      redoCommand();
      return true;
    case 'edit.copy':
      writeSystemClipboard(copySelection());
      return true;
    case 'edit.cut':
      writeSystemClipboard(cutSelection());
      return true;
    case 'edit.paste':
      void pasteCommand();
      return true;
    case 'edit.delete':
      deleteSelection();
      return true;
    case 'edit.duplicate':
      duplicateSelection();
      return true;
    case 'edit.selectAll':
      selectAll();
      return true;
    case 'pianoRoll.transposeUp':
      transposeSelection(1);
      return true;
    case 'pianoRoll.transposeDown':
      transposeSelection(-1);
      return true;
    case 'pianoRoll.transposeOctaveUp':
      transposeSelection(12);
      return true;
    case 'pianoRoll.transposeOctaveDown':
      transposeSelection(-12);
      return true;
    case 'pianoRoll.shiftLeft':
      shiftSelection(-shiftStep());
      return true;
    case 'pianoRoll.shiftRight':
      shiftSelection(shiftStep());
      return true;
    default:
      return false;
  }
}
