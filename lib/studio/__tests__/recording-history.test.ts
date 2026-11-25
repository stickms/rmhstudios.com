import { beforeEach, describe, expect, it } from 'vitest';
import { commitTakeClips, takeClips } from '@/lib/studio/record-commit';
import type { RecordEvent } from '@/lib/studio/record';
import { undoCommand, redoCommand } from '@/lib/studio/edit-commands';
import { useJamStore } from '@/lib/studio/jam/store';
import { useStudioStore } from '@/lib/studio/store';
import type { MidiClipData, Track } from '@/lib/studio/types';

const track = (id: string, armed: boolean): Track => ({
  id,
  name: id,
  type: 'midi',
  color: '#fff',
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
  armed,
  clipIds: [],
  pluginChain: [],
  sends: [],
  height: 80,
});
const st = () => useStudioStore.getState();
let seq = 0;
const events: RecordEvent[] = [
  { kind: 'on', pitch: 60, velocity: 100, seconds: 0.5 },
  { kind: 'off', pitch: 60, velocity: 0, seconds: 1 },
];
const opts = () => ({
  bpm: 120,
  beatsPerBar: 4,
  startSeconds: 0,
  endSeconds: 4,
  latencyMs: 0,
  quantize: 'off' as const,
  newId: () => `id${++seq}`,
});

beforeEach(() => {
  useJamStore.getState().reset();
  st().newProject();
  const existing: MidiClipData = {
    id: 'old',
    trackId: 'a',
    type: 'midi',
    name: 'old',
    startBeat: 0,
    durationBeats: 4,
    color: '#fff',
    notes: [{ id: 'on1', pitch: 50, startBeat: 0, durationBeats: 1, velocity: 90 }],
  };
  st().addTrack(track('a', true));
  st().addTrack(track('b', true));
  st().addClip(existing);
  st().flushHistory();
});

describe('a recorded take in history', () => {
  it('is one undoable step that removes every clip it made', () => {
    const before = Object.keys(st().clips);
    const clips = takeClips([track('a', true), track('b', true)], events, opts(), 'Take');
    expect(clips).toHaveLength(2);
    expect(commitTakeClips(clips)).toBe(true);
    expect(Object.keys(st().clips)).toHaveLength(before.length + 2);

    expect(undoCommand()).toBe(true);
    expect(Object.keys(st().clips)).toEqual(before);
    expect(st().tracks.find((t) => t.id === 'a')?.clipIds).toEqual(['old']);
    expect(st().tracks.find((t) => t.id === 'b')?.clipIds).toEqual([]);
  });

  it('redo puts the take back', () => {
    commitTakeClips(takeClips([track('a', true)], events, opts(), 'Take'));
    undoCommand();
    expect(redoCommand()).toBe(true);
    expect(st().tracks.find((t) => t.id === 'a')?.clipIds).toHaveLength(2);
  });

  it('is named Record take', () => {
    commitTakeClips(takeClips([track('a', true)], events, opts(), 'Take'));
    expect(st().history.past[st().history.past.length - 1]?.label).toBe('record-take');
  });

  it('leaves existing clips untouched', () => {
    const old = st().clips.old;
    commitTakeClips(takeClips([track('a', true)], events, opts(), 'Take'));
    expect(st().clips.old).toBe(old);
    expect((st().clips.old as MidiClipData).notes).toHaveLength(1);
  });

  it('makes nothing from a take with no notes', () => {
    const steps = st().history.past.length;
    const clips = takeClips([track('a', true)], [], opts(), 'Take');
    expect(clips).toEqual([]);
    expect(commitTakeClips(clips)).toBe(false);
    expect(st().history.past.length).toBe(steps);
  });
});
