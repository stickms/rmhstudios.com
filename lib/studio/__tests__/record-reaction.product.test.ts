import { describe, expect, it } from 'vitest';
import { recordReaction, recordRefusal, type RecordWatchState } from '@/lib/studio/record';

const idle: RecordWatchState = { isRecording: false, isPlaying: false, loopEnabled: false, recordPhase: 'idle' };
const st = (over: Partial<RecordWatchState>): RecordWatchState => ({ ...idle, ...over });
const midi = (armed: boolean) => ({ type: 'midi', armed });

describe('recordRefusal: when a take may start', () => {
  it('needs an armed MIDI track', () => {
    expect(recordRefusal({ loopEnabled: false, tracks: [] })).toBe('no-armed-track');
    expect(recordRefusal({ loopEnabled: false, tracks: [midi(false), { type: 'audio', armed: true }] })).toBe(
      'no-armed-track',
    );
    expect(recordRefusal({ loopEnabled: false, tracks: [midi(true)] })).toBeNull();
  });

  it('refuses while the loop is on, because the transport clock would jump back under the take', () => {
    expect(recordRefusal({ loopEnabled: true, tracks: [midi(true)] })).toBe('loop-on');
  });
});

describe('recordReaction: what a store change does to a take', () => {
  it('begins and ends with the record flag', () => {
    expect(recordReaction(st({ isRecording: true }), idle)).toBe('begin');
    expect(recordReaction(idle, st({ isRecording: true, recordPhase: 'recording', isPlaying: true }))).toBe('end');
  });

  it('cancels the count-in when play is pressed during it (Space), instead of marking the take "was playing"', () => {
    const counting = st({ isRecording: true, recordPhase: 'count-in' });
    expect(recordReaction({ ...counting, isPlaying: true }, counting)).toBe('cancel-count-in');
  });

  it('ends a running take when the transport stops under it', () => {
    const rec = st({ isRecording: true, recordPhase: 'recording', isPlaying: true });
    expect(recordReaction({ ...rec, isPlaying: false }, rec)).toBe('stop-take');
  });

  it('ends a running take when the loop is switched on, before the transport can wrap', () => {
    const rec = st({ isRecording: true, recordPhase: 'recording', isPlaying: true });
    expect(recordReaction({ ...rec, loopEnabled: true }, rec)).toBe('stop-take');
  });

  it('ignores everything else', () => {
    const rec = st({ isRecording: true, recordPhase: 'recording', isPlaying: true });
    expect(recordReaction(rec, rec)).toBeNull();
    expect(recordReaction(st({ isPlaying: true }), idle)).toBeNull();
    expect(recordReaction(st({ loopEnabled: true }), idle)).toBeNull();
    // The beat moving during a take is not a reaction.
    expect(recordReaction({ ...rec }, { ...rec })).toBeNull();
  });
});
