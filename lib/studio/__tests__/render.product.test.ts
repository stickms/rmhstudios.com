import { describe, expect, it, vi } from 'vitest';
import * as graph from '@/lib/studio/engine/graph';
import {
  renderChannels,
  renderMix,
  RenderError,
  loadClipBuffers,
  PROGRESS_INTERVAL_MS,
} from '@/lib/studio/export/render';
import { exportRange } from '@/lib/studio/export/range';
import type { Track } from '@/lib/studio/types';

type Call = [string, ...unknown[]];

/** A Tone stub that records what the graph builder asks of it. Node has no OfflineAudioContext. */
function makeTone(
  opts: {
    hang?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const node = (name: string) =>
    class {
      volume = {
        value: 0,
      };
      constructor(...args: unknown[]) {
        calls.push([`new ${name}`, ...args]);
      }
      connect(to: unknown) {
        calls.push([`${name}.connect`, to]);
        return this;
      }
      chain(...to: unknown[]) {
        calls.push([`${name}.chain`, ...to]);
        return this;
      }
      dispose() {}
    };
  const destination = {
    id: 'destination',
  };
  const state: {
    offline?: {
      duration: number;
      channels: number;
      rate: number;
    };
  } = {};
  const tone = {
    Channel: node('Channel'),
    Limiter: node('Limiter'),
    Analyser: node('Analyser'),
    Meter: node('Meter'),
    PolySynth: class extends node('PolySynth') {
      triggerAttackRelease(...a: unknown[]) {
        calls.push(['triggerAttackRelease', ...a]);
      }
    },
    Synth: class {},
    Frequency: (p: number) => ({
      toFrequency: () => 440 + p,
    }),
    gainToDb: (g: number) => 20 * Math.log10(g),
    getDestination: () => destination,
    Offline: vi.fn((cb: () => void, duration: number, channels: number, rate: number) => {
      state.offline = {
        duration,
        channels,
        rate,
      };
      cb();
      if (opts.hang) return new Promise(() => undefined);
      const data = [new Float32Array(4).fill(0.5), new Float32Array(4).fill(-0.5)];
      return Promise.resolve({
        get: () => ({
          numberOfChannels: 2,
          getChannelData: (i: number) => data[i],
        }),
      });
    }),
  };
  return {
    tone: tone as unknown as graph.ToneModule,
    calls,
    state,
    destination,
    offline: tone.Offline,
  };
}

const track = (over: Partial<Track> = {}): Track => ({
  id: 't1',
  name: 'Keys',
  type: 'midi',
  color: '#fff',
  volume: 0.5,
  pan: 0,
  muted: false,
  soloed: false,
  armed: false,
  clipIds: ['c1'],
  pluginChain: [],
  sends: [],
  height: 80,
  ...over,
});

const project = (tracks: Track[] = [track()]): graph.GraphProject => ({
  bpm: 120,
  masterVolume: 1,
  tracks,
  clips: {
    c1: {
      id: 'c1',
      trackId: 't1',
      type: 'midi',
      name: 'c',
      startBeat: 2,
      durationBeats: 4,
      color: '#fff',
      notes: [
        {
          id: 'n',
          pitch: 60,
          startBeat: 0,
          durationBeats: 1,
          velocity: 127,
        },
      ],
    },
  },
  patterns: [],
});

function rangeOf(p: graph.GraphProject) {
  const r = exportRange({
    mode: 'song',
    bpm: p.bpm,
    tracks: p.tracks,
    clips: p.clips,
    loopStart: 0,
    loopEnd: 0,
  });
  if (!r.ok) throw new Error('range');
  return r;
}

describe('renderChannels', () => {
  it('passes the range length, the rate and two channels to Tone.Offline', async () => {
    const { tone, offline, state } = makeTone();
    const p = project();
    const range = rangeOf(p);
    await renderChannels(tone, {
      project: p,
      range,
      sampleRate: 48000,
      bitDepth: 16,
      buffers: new Map(),
    });
    expect(offline).toHaveBeenCalledTimes(1);
    expect(state.offline).toEqual({
      duration: range.durationSeconds,
      channels: 2,
      rate: 48000,
    });
    expect(state.offline?.duration).toBe(2 + 2); // 4 beats at 120 bpm plus the tail
  });

  it('builds the offline graph the way the live engine builds it', async () => {
    const { tone, calls, destination } = makeTone();
    const p = project();
    await renderChannels(tone, {
      project: p,
      range: rangeOf(p),
      sampleRate: 44100,
      bitDepth: 16,
      buffers: new Map(),
    });
    const offline = calls.filter((c) => c[0] === 'new Channel' || c[0] === 'new Limiter');
    // master channel -> limiter -> destination (live adds the analyser and meter)
    expect(calls.some((c) => c[0] === 'Channel.chain' && c[2] === destination)).toBe(true);
    expect(calls.some((c) => c[0] === 'new Analyser')).toBe(false);

    // The live engine, started against the same stub, makes the same master channel and limiter...
    const live = makeTone();
    vi.resetModules();
    vi.doMock('tone', () => ({
      ...live.tone,
      start: async () => undefined,
    }));
    const { StudioEngine } = await import('@/lib/studio/engine/StudioEngine');
    const engine = StudioEngine.getInstance();
    await engine.initialize();
    engine.createTrackChannel('t1', 20 * Math.log10(0.5), 0);
    const liveCalls = live.calls.filter((c) => c[0] === 'new Channel' || c[0] === 'new Limiter');
    expect(liveCalls[0]).toEqual(offline[0]);
    expect(liveCalls[1]).toEqual(offline[1]);
    // ...and the same track strip, with the same arguments.
    expect(liveCalls[2]).toEqual(offline[2]);
    expect(live.calls.some((c) => c[0] === 'new Analyser')).toBe(true);
    engine.dispose();
    vi.doUnmock('tone');
  });

  it('schedules a note at its clip start inside the render', async () => {
    const { tone, calls } = makeTone();
    const p = project();
    await renderChannels(tone, {
      project: p,
      range: rangeOf(p),
      sampleRate: 44100,
      bitDepth: 16,
      buffers: new Map(),
    });
    // the clip starts at beat 2 and the render starts at beat 2
    expect(calls.find((c) => c[0] === 'triggerAttackRelease')?.[3]).toBe(0);
  });

  it('leaves muted tracks out of the graph', async () => {
    const a = track({
      id: 'a',
      muted: true,
      clipIds: ['c1'],
    });
    const b = track({
      id: 'b',
      clipIds: [],
    });
    const { tone, calls } = makeTone();
    const range = {
      ok: true as const,
      startBeat: 2,
      endBeat: 6,
      startSeconds: 1,
      durationSeconds: 4,
    };
    await renderChannels(tone, {
      project: project([a, b]),
      range,
      sampleRate: 44100,
      bitDepth: 16,
      buffers: new Map(),
    });
    const strips = calls.filter(
      (c) =>
        c[0] === 'new Channel' &&
        (
          c[1] as {
            pan?: number;
          }
        ).pan !== undefined,
    );
    expect(strips).toHaveLength(1);
    expect(calls.some((c) => c[0] === 'triggerAttackRelease')).toBe(false);
  });

  it('returns two channels of data', async () => {
    const { tone } = makeTone();
    const p = project();
    const ch = await renderChannels(tone, {
      project: p,
      range: rangeOf(p),
      sampleRate: 44100,
      bitDepth: 16,
      buffers: new Map(),
    });
    expect(ch).toHaveLength(2);
    expect(ch[0][0]).toBe(0.5);
  });

  it('encodes a WAV of the rendered length', async () => {
    const { tone } = makeTone();
    const p = project();
    const blob = await renderMix(tone, {
      project: p,
      range: rangeOf(p),
      sampleRate: 44100,
      bitDepth: 24,
      buffers: new Map(),
    });
    expect(blob.size).toBe(44 + 4 * 6);
  });
});

describe('progress and cancel', () => {
  it('reports progress on a timer, below 100%, and stops the timer when the render ends', async () => {
    const { tone } = makeTone();
    const p = project();
    const handles: unknown[] = [];
    const cleared: unknown[] = [];
    let tick: () => void = () => undefined;
    const seen: number[] = [];
    let clock = 0;
    await renderChannels(tone, {
      project: p,
      range: rangeOf(p),
      sampleRate: 44100,
      bitDepth: 16,
      buffers: new Map(),
      now: () => clock,
      setTimer: (fn, ms) => {
        expect(ms).toBe(PROGRESS_INTERVAL_MS);
        tick = fn;
        handles.push(fn);
        return 'timer';
      },
      clearTimer: (h) => cleared.push(h),
      onProgress: (f) => seen.push(f),
    });
    clock = 1_000_000;
    tick();
    expect(seen.at(-1)).toBeLessThanOrEqual(0.95);
    expect(handles).toHaveLength(1);
    expect(cleared).toEqual(['timer']);
  });

  it('Cancel rejects with a cancelled error and stops the timer', async () => {
    const { tone } = makeTone({
      hang: true,
    });
    const p = project();
    const controller = new AbortController();
    const cleared: unknown[] = [];
    const pending = renderChannels(tone, {
      project: p,
      range: rangeOf(p),
      sampleRate: 44100,
      bitDepth: 16,
      buffers: new Map(),
      signal: controller.signal,
      setTimer: () => 'timer',
      clearTimer: (h) => cleared.push(h),
      onProgress: () => undefined,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      reason: 'cancelled',
    });
    expect(cleared).toEqual(['timer']);
  });

  it('does not start when already cancelled', async () => {
    const { tone, offline } = makeTone();
    const p = project();
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderChannels(tone, {
        project: p,
        range: rangeOf(p),
        sampleRate: 44100,
        bitDepth: 16,
        buffers: new Map(),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(RenderError);
    expect(offline).not.toHaveBeenCalled();
  });

  it('turns a failed render into a failed error', async () => {
    const { tone, offline } = makeTone();
    offline.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    const p = project();
    await expect(
      renderChannels(tone, {
        project: p,
        range: rangeOf(p),
        sampleRate: 44100,
        bitDepth: 16,
        buffers: new Map(),
      }),
    ).rejects.toMatchObject({
      reason: 'failed',
    });
  });
});

describe('loadClipBuffers', () => {
  it('loads only the buffers audible audio clips use, and skips ones that are missing', async () => {
    const p: graph.GraphProject = {
      ...project([
        track({
          id: 'a',
          clipIds: ['x'],
        }),
        track({
          id: 'b',
          muted: true,
          clipIds: ['y'],
        }),
      ]),
      clips: {
        x: {
          id: 'x',
          trackId: 'a',
          type: 'audio',
          name: '',
          startBeat: 0,
          durationBeats: 1,
          color: '',
          bufferId: 's1',
          sampleOffset: 0,
          fadeInBeats: 0,
          fadeOutBeats: 0,
        },
        y: {
          id: 'y',
          trackId: 'b',
          type: 'audio',
          name: '',
          startBeat: 0,
          durationBeats: 1,
          color: '',
          bufferId: 's2',
          sampleOffset: 0,
          fadeInBeats: 0,
          fadeOutBeats: 0,
        },
      },
    };
    const asked: string[] = [];
    const out = await loadClipBuffers(p, async (id) => {
      asked.push(id);
      return null;
    });
    expect(asked).toEqual(['s1']);
    expect(out.size).toBe(0);
  });
});
