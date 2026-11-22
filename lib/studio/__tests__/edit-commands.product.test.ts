import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearMemoryClipboard,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  historyAvailability,
  pasteFromText,
  redoCommand,
  runEditAction,
  selectAll,
  shiftSelection,
  transposeSelection,
  undoCommand,
} from '@/lib/studio/edit-commands';
import { serializeClipboard } from '@/lib/studio/clipboard';
import { useJamStore } from '@/lib/studio/jam/store';
import { useStudioStore } from '@/lib/studio/store';
import type { MidiClipData, MidiNote, Track } from '@/lib/studio/types';

const track = (id: string): Track => ({
  id,
  name: id,
  type: 'midi',
  color: '#fff',
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
  armed: false,
  clipIds: [],
  pluginChain: [],
  sends: [],
  height: 80,
});
const note = (id: string, pitch: number, start: number, dur = 1): MidiNote => ({
  id,
  pitch,
  startBeat: start,
  durationBeats: dur,
  velocity: 100,
});
const clip = (id: string, start: number, notes: MidiNote[] = []): MidiClipData => ({
  id,
  trackId: 't1',
  type: 'midi',
  name: id,
  startBeat: start,
  durationBeats: 4,
  color: '#fff',
  notes,
});
const st = () => useStudioStore.getState();
const notesOf = (id: string) => (st().clips[id] as MidiClipData).notes;

function setup(notes: MidiNote[] = []) {
  useJamStore.getState().reset();
  clearMemoryClipboard();
  st().newProject();
  st().addTrack(track('t1'));
  st().addClip(clip('c1', 0, notes));
  st().clearHistory();
}
function openRoll(selected: string[]) {
  st().setActiveView('pianoRoll');
  st().setPianoRollClip('c1');
  st().selectNotes(selected);
}

beforeEach(() => setup());
afterEach(() => useJamStore.getState().reset());

describe('clip commands', () => {
  it('delete then undo restores the clip, redo deletes again', () => {
    st().selectClips(['c1']);
    expect(deleteSelection()).toBe(true);
    expect(st().clips.c1).toBeUndefined();
    expect(undoCommand()).toBe(true);
    expect(st().clips.c1).toBeDefined();
    expect(st().tracks[0].clipIds).toContain('c1');
    expect(redoCommand()).toBe(true);
    expect(st().clips.c1).toBeUndefined();
  });

  it('copy two clips, move the playhead, paste: one undo step at the playhead', () => {
    st().addClip(clip('c2', 8));
    st().clearHistory();
    st().selectClips(['c1', 'c2']);
    const text = copySelection()!;
    expect(text).toContain('rmh-studio-clipboard/1');
    st().setCurrentBeat(32);
    expect(pasteFromText(null)).toBe(true);
    const added = Object.values(st().clips).filter((c) => c.id !== 'c1' && c.id !== 'c2');
    expect(added.map((c) => c.startBeat).sort((a, b) => a - b)).toEqual([32, 40]);
    undoCommand();
    expect(Object.keys(st().clips).sort()).toEqual(['c1', 'c2']);
  });

  it('pasting text from another tab works, foreign text is ignored', () => {
    const text = serializeClipboard({
      kind: 'clips',
      clips: [clip('z', 0)],
    });
    st().setCurrentBeat(4);
    expect(pasteFromText(text)).toBe(true);
    expect(pasteFromText('just some words')).toBe(false);
    expect(Object.keys(st().clips)).toHaveLength(2);
  });

  it('cut removes and can be pasted back; duplicate places after the selection', () => {
    st().selectClips(['c1']);
    expect(cutSelection()).not.toBeNull();
    expect(st().clips.c1).toBeUndefined();
    pasteFromText(null);
    expect(Object.keys(st().clips)).toHaveLength(1);
    const only = Object.values(st().clips)[0];
    st().selectClips([only.id]);
    duplicateSelection();
    const starts = Object.values(st().clips)
      .map((c) => c.startBeat)
      .sort((a, b) => a - b);
    expect(starts).toEqual([only.startBeat, only.startBeat + only.durationBeats]);
  });

  it('select all selects every clip outside the piano roll', () => {
    st().addClip(clip('c2', 8));
    st().setActiveView('arrangement');
    selectAll();
    expect(st().selectedClipIds.sort()).toEqual(['c1', 'c2']);
  });
});

describe('note commands', () => {
  beforeEach(() => {
    setup([note('a', 60, 1), note('b', 64, 2)]);
    openRoll(['a', 'b']);
  });

  it('transposes by one step and clamps the group to 0 to 127', () => {
    expect(transposeSelection(1)).toBe(true);
    expect(notesOf('c1').map((n) => n.pitch)).toEqual([61, 65]);
    expect(transposeSelection(12)).toBe(true);
    expect(transposeSelection(1000)).toBe(true);
    expect(Math.max(...notesOf('c1').map((n) => n.pitch))).toBe(127);
    expect(transposeSelection(1)).toBe(false);
    transposeSelection(-1000);
    expect(Math.min(...notesOf('c1').map((n) => n.pitch))).toBe(0);
    expect(transposeSelection(-1)).toBe(false);
  });

  it('each transpose is one undo step', () => {
    transposeSelection(1);
    transposeSelection(1);
    undoCommand();
    expect(notesOf('c1').map((n) => n.pitch)).toEqual([61, 65]);
    undoCommand();
    expect(notesOf('c1').map((n) => n.pitch)).toEqual([60, 64]);
  });

  it('shifts by a step and never before beat 0', () => {
    expect(shiftSelection(0.25)).toBe(true);
    expect(notesOf('c1').map((n) => n.startBeat)).toEqual([1.25, 2.25]);
    shiftSelection(-100);
    expect(notesOf('c1').map((n) => n.startBeat)).toEqual([0, 1]);
    expect(shiftSelection(-1)).toBe(false);
  });

  it('runs from keybind action ids using the snap value', () => {
    st().setSnapValue(0.5);
    expect(runEditAction('pianoRoll.shiftRight')).toBe(true);
    expect(notesOf('c1')[0].startBeat).toBe(1.5);
    runEditAction('pianoRoll.transposeOctaveDown');
    expect(notesOf('c1')[0].pitch).toBe(48);
    expect(runEditAction('transport.stop')).toBe(false);
  });

  it('duplicate places the copies after the selection and selects them', () => {
    duplicateSelection();
    const ns = notesOf('c1');
    expect(ns).toHaveLength(4);
    expect(ns.slice(2).map((n) => n.startBeat)).toEqual([3, 4]);
    expect(st().selectedNoteIds).toHaveLength(2);
    undoCommand();
    expect(notesOf('c1')).toHaveLength(2);
  });

  it('copies notes and pastes them at the playhead inside the open clip', () => {
    openRoll(['a']);
    copySelection();
    st().setCurrentBeat(3);
    expect(pasteFromText(null)).toBe(true);
    expect(notesOf('c1').filter((n) => n.startBeat === 3)).toHaveLength(1);
    openRoll(['a']);
    deleteSelection();
    expect(notesOf('c1').some((n) => n.id === 'a')).toBe(false);
  });
});

describe('jam sessions', () => {
  it('disables undo and redo while a jam is connected, explaining why', () => {
    st().addTrack(track('t2'));
    expect(historyAvailability().canUndo).toBe(true);
    useJamStore.getState().set({
      status: 'live',
    });
    const a = historyAvailability();
    expect(a.blocked).toBe('jam');
    expect(a.canUndo).toBe(false);
    expect(undoCommand()).toBe(false);
    expect(redoCommand()).toBe(false);
  });

  it('clears history when a jam connects and again when it ends', () => {
    st().addTrack(track('t2'));
    expect(st().history.past.length).toBeGreaterThan(0);
    useJamStore.getState().set({
      status: 'connecting',
    });
    expect(
      historyAvailability({
        history: st().history,
      }).undoLabel,
    ).toBeNull();
    useJamStore.getState().set({
      status: 'live',
    });
    // Edits during the jam are not recorded.
    st().addTrack(track('t3'));
    useJamStore.getState().set({
      status: 'off',
    });
    expect(historyAvailability().canUndo).toBe(false);
    expect(st().history.past).toHaveLength(0);
    expect(st().tracks.map((t) => t.id)).toContain('t3');
  });
});
