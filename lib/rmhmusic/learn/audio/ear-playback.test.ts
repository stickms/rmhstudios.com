import { describe, expect, it } from 'vitest';
import type { PlayingSequence } from './sequence';
import { autoPlay, createEarPlayback, hearAction, soundRowOf } from './ear-playback';
import type { SoundStatus } from './voice';

describe('soundRowOf', () => {
  it('shows ready, none, loading and failed as they are', () => {
    for (const s of ['ready', 'none', 'loading', 'failed'] as const) {
      expect(soundRowOf(s, 'idle')).toBe(s);
      expect(soundRowOf(s, 'waking')).toBe(s);
    }
  });
  it('shows asleep as waking or failed while a tap is working on it', () => {
    expect(soundRowOf('asleep', 'idle')).toBe('asleep');
    expect(soundRowOf('asleep', 'waking')).toBe('waking');
    expect(soundRowOf('asleep', 'failed')).toBe('failed');
  });
});

describe('hearAction', () => {
  const act = (status: SoundStatus, waiting = false, paused = false) =>
    hearAction({ status, waiting, paused });
  it('replays when ready, wakes when asleep or failed, says so when there is no audio', () => {
    expect(act('ready')).toBe('replay');
    expect(act('asleep')).toBe('wake');
    expect(act('failed')).toBe('wake');
    expect(act('none')).toBe('none');
  });
  it('waits while a sampled sound loads', () => {
    expect(act('loading')).toBe('wait');
  });
  it('stops what is playing while a dialog is open, whatever the audio state', () => {
    for (const s of ['ready', 'asleep', 'none', 'loading', 'failed'] as const) {
      expect(act(s, false, true)).toBe('stop');
      expect(act(s, true, true)).toBe('stop');
    }
  });
  it('ignores a tap while another is waiting', () => {
    expect(act('asleep', true)).toBe('ignore');
  });
});

describe('autoPlay', () => {
  const base = {
    askingUnheard: true,
    paused: false,
    shown: 'ready' as SoundStatus,
    live: 'ready' as SoundStatus,
    index: 0,
    sentFor: null as number | null,
  };
  it('plays an unheard question once sound is ready, and notes which', () => {
    expect(autoPlay(base)).toEqual({ play: true, sentFor: 0 });
  });
  it('plays once per question: a second run of the effect (StrictMode) does nothing', () => {
    const first = autoPlay(base);
    expect(autoPlay({ ...base, sentFor: first.sentFor })).toEqual({ play: false, sentFor: 0 });
    expect(autoPlay({ ...base, index: 1, sentFor: first.sentFor })).toEqual({
      play: true,
      sentFor: 1,
    });
  });
  it('does not play when heard, paused, or sound is not ready (shown or live), and forgets', () => {
    for (const change of [
      { askingUnheard: false },
      { paused: true },
      { shown: 'asleep' as const },
      { live: 'asleep' as const },
      { live: 'loading' as const },
    ]) {
      expect(autoPlay({ ...base, ...change, sentFor: 0 })).toEqual({ play: false, sentFor: null });
    }
  });
  it('plays a cut-off question again after the conditions lapse and return', () => {
    const lapsed = autoPlay({ ...base, paused: true, sentFor: 0 });
    expect(autoPlay({ ...base, sentFor: lapsed.sentFor })).toEqual({ play: true, sentFor: 0 });
  });
});

/** A sound whose last note the test starts by hand. */
function fakePlay() {
  const made: { cancelled: boolean; finish: () => void; started: boolean }[] = [];
  const play = (
    _kind: string,
    _notes: readonly number[],
    hooks: { onAllStarted: () => void },
  ): PlayingSequence => {
    const item = {
      cancelled: false,
      started: true,
      finish: () => hooks.onAllStarted(),
    };
    made.push(item);
    return {
      get started() {
        return item.started;
      },
      cancel() {
        item.cancelled = true;
      },
    };
  };
  return { made, play };
}

describe('createEarPlayback', () => {
  it('reports the question as heard only when its last note has started', () => {
    const { made, play } = fakePlay();
    const heard: number[] = [];
    const pb = createEarPlayback({ play, onHeard: (i) => heard.push(i) });
    expect(pb.start(3, 'interval', [60, 67])).toBe(true);
    expect(heard).toEqual([]); // the first note started; the question is not heard yet
    made[0].finish();
    expect(heard).toEqual([3]);
  });

  it('a cancel before the end never reports, even if the last note was already on its way', () => {
    const { made, play } = fakePlay();
    const heard: number[] = [];
    const pb = createEarPlayback({ play, onHeard: (i) => heard.push(i) });
    pb.start(0, 'interval', [60, 67]);
    pb.cancel();
    expect(made[0].cancelled).toBe(true);
    made[0].finish();
    expect(heard).toEqual([]);
    expect(() => pb.cancel()).not.toThrow();
  });

  it('a stale sound after Retry or Next is ignored; only the current one reports', () => {
    const { made, play } = fakePlay();
    const heard: number[] = [];
    const pb = createEarPlayback({ play, onHeard: (i) => heard.push(i) });
    pb.start(0, 'interval', [60, 67]); // the last attempt's first question
    pb.cancel(); // Retry: the session left it behind
    pb.start(0, 'interval', [62, 69]); // the new attempt's first question, the same index
    made[0].finish(); // the old sound's second note still arrives
    expect(heard).toEqual([]);
    made[1].finish();
    expect(heard).toEqual([0]);
  });

  it('starting another cancels the one before and ignores its report', () => {
    const { made, play } = fakePlay();
    const heard: number[] = [];
    const pb = createEarPlayback({ play, onHeard: (i) => heard.push(i) });
    pb.start(1, 'interval', [60, 67]);
    pb.start(2, 'interval', [62, 69]);
    expect(made[0].cancelled).toBe(true);
    made[0].finish();
    made[1].finish();
    expect(heard).toEqual([2]);
  });

  it('a chord that sounds during the call is heard, and still cancels', () => {
    const heard: number[] = [];
    let seq: { cancelled: boolean } | null = null;
    const pb = createEarPlayback({
      play: (_k, _n, hooks) => {
        hooks.onAllStarted(); // sync, before play returns
        const s = { cancelled: false };
        seq = s;
        return {
          started: true,
          cancel: () => {
            s.cancelled = true;
          },
        };
      },
      onHeard: (i) => heard.push(i),
    });
    expect(pb.start(4, 'chord', [60, 64, 67])).toBe(true);
    expect(heard).toEqual([4]);
    pb.cancel();
    expect((seq as { cancelled: boolean } | null)?.cancelled).toBe(true);
  });

  it('returns false when nothing started, and never reports', () => {
    const heard: number[] = [];
    const pb = createEarPlayback({
      play: () => ({ started: false, cancel: () => {} }),
      onHeard: (i) => heard.push(i),
    });
    expect(pb.start(0, 'interval', [60, 67])).toBe(false);
    expect(heard).toEqual([]);
  });
});
