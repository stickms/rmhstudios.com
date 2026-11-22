/**
 * A sampled instrument: recorded zones, decoded into `AudioBuffer`s and played through
 * `AudioBufferSourceNode`s on the shared context. Implements {@link Instrument}.
 *
 * - Loading follows `load-machine.ts` (`idle -> loading -> ready | failed`), single flight. The
 *   network and decoding are `loader.ts`; nothing loads until `load()` is called.
 * - A note: nearest zone and `playbackRate` (`zones.ts`), gain = velocity curve x `1/sqrt(chordOf)`
 *   x the zone's trim x the bus gain, a short attack ramp so nothing clicks, and on the piano a
 *   low-pass that darkens soft notes. Voices are capped by `voice-pool.ts`: the oldest released
 *   voice is stolen first; a monophonic instrument hands over legato.
 * - `stop()` ramps the voice to silence over `meta.releaseMs`, which is therefore the audible tail
 *   the mic echo guard waits out, however long the recording would ring.
 * - Not ready, or a note it cannot reach: a silent handle, never a throw. The caller (`voice.ts`)
 *   falls back to the synth.
 *
 * Browser-only at call time, but everything it touches comes in through {@link SamplerDeps}, so the
 * unit tests drive it with a fake context. No timers at rest: one timer marks a slow load while a
 * load runs, and none otherwise.
 */
import { chordGain } from './chord';
import { loadZones, type LoaderDeps } from './loader';
import { SLOW_MS, initial, step, type LoadEvent, type LoadState } from './load-machine';
import type { Instrument, InstrumentMeta, NoteHandle, PlayOpts, Zone } from './types';
import { createVoicePool } from './voice-pool';
import { DEFAULT_VELOCITY, coverage, nearestZone, velocityCutoffHz, velocityGain } from './zones';

/** The fade-in of every voice (s): long enough not to click, short enough to keep the attack. */
export const ATTACK_S = 0.004;
/** How fast a stolen or legato-replaced voice gets out of the way (s). */
export const HANDOVER_S = 0.07;

export interface SamplerDeps {
  /** The shared context (`getAudioContext()`); null without Web Audio. */
  ctx(): AudioContext | null;
  /** Where voices connect (the shared master chain on that context). */
  output(ctx: AudioContext): AudioNode;
  /** The URL of a zone's file. */
  urlOf(zone: Zone): string;
  /** Network and decoding, minus `decode`, which uses the context. */
  loader: Omit<LoaderDeps, 'decode'>;
  /** Wall clock (ms), for the load machine. */
  now(): number;
}

const SILENT: NoteHandle = {
  stop() {},
  done: Promise.resolve(),
};

interface LiveVoice {
  release(at: number, seconds: number): void;
}

export function createSampler(meta: InstrumentMeta, zones: readonly Zone[], deps: SamplerDeps): Instrument {
  let state: LoadState = initial();
  let inflight: Promise<LoadState> | null = null;
  let buffers = new Map<string, AudioBuffer>();
  let loadedZones: Zone[] = [];
  const listeners = new Set<() => void>();
  const pool = createVoicePool(meta.maxVoices, meta.maxVoices === 1);
  const live = new Map<number, LiveVoice>();
  let nextId = 1;

  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  const dispatch = (e: LoadEvent) => {
    const r = step(state, e);
    const changed = r.state !== state;
    state = r.state;
    for (const eff of r.effects) {
      if (eff.type === 'free-buffers') {
        stopAll();
        buffers = new Map();
        loadedZones = [];
      }
    }
    if (changed) notify();
    return r.effects;
  };

  function stopAll() {
    const ctx = deps.ctx();
    const t = ctx ? ctx.currentTime : 0;
    for (const v of [...live.values()]) v.release(t, HANDOVER_S);
  }

  async function runLoad(ctx: AudioContext): Promise<LoadState> {
    const slow = setTimeout(
      () =>
        dispatch({
          type: 'tick',
          now: deps.now(),
        }),
      SLOW_MS,
    );
    try {
      const result = await loadZones(
        zones,
        deps.urlOf,
        {
          ...deps.loader,
          decode: (data) => ctx.decodeAudioData(data),
        },
        (_zone, r) =>
          dispatch(
            r.ok
              ? {
                  type: 'zone-ok',
                }
              : {
                  type: 'zone-failed',
                  reason: r.reason,
                },
          ),
      );
      buffers = result.buffers;
      loadedZones = zones.filter((z) => buffers.has(z.file));
      dispatch({
        type: 'settled',
        coverageOk: coverage(zones, new Set(buffers.keys()), meta.range, meta.maxShift),
        now: deps.now(),
      });
      if (state.kind !== 'ready') {
        buffers = new Map();
        loadedZones = [];
      }
      return state;
    } finally {
      clearTimeout(slow);
      inflight = null;
    }
  }

  function canPlay(midi: number): boolean {
    if (state.kind !== 'ready' || !Number.isFinite(midi)) return false;
    if (midi < meta.range[0] || midi > meta.range[1]) return false;
    return nearestZone(loadedZones, midi, meta.maxShift) !== null;
  }

  function play(midi: number, opts: PlayOpts = {}): NoteHandle {
    const ctx = deps.ctx();
    if (!ctx || ctx.state === 'closed' || !canPlay(midi)) return SILENT;
    const hit = nearestZone(loadedZones, midi, meta.maxShift);
    const buffer = hit && buffers.get(hit.zone.file);
    if (!hit || !buffer) return SILENT;

    const velocity = opts.velocity ?? DEFAULT_VELOCITY;
    const when = Math.max(ctx.currentTime, opts.when ?? ctx.currentTime);
    const level = velocityGain(velocity) * chordGain(opts.chordOf ?? 1) * 10 ** (hit.zone.gainDb / 20) * meta.busGain;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = hit.rate;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + ATTACK_S);
    let filter: BiquadFilterNode | null = null;
    if (meta.softLowpass) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = velocityCutoffHz(velocity);
      filter.Q.value = 0.5;
      src.connect(filter);
      filter.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(deps.output(ctx));

    const id = nextId++;
    let released = false;
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const voice: LiveVoice = {
      release(at, seconds) {
        if (released) return;
        released = true;
        pool.release(id, at);
        try {
          if (at < when) {
            // Released before it starts (a strum cancelled mid-way): stopping the source at or
            // before its start means it never sounds, so nothing is left to fade.
            src.stop(at);
            return;
          }
          gain.gain.cancelScheduledValues(at);
          // Hold the level the envelope has reached (computed, never read back from the param,
          // whose `value` lags its automation), then fall to silence.
          gain.gain.setValueAtTime(envelopeAt(at), at);
          gain.gain.linearRampToValueAtTime(0, at + seconds);
          src.stop(at + seconds + 0.01);
        } catch {
          // Already stopped.
        }
      },
    };
    /** The level the attack ramp has reached at time `t`. */
    function envelopeAt(t: number): number {
      if (t <= when) return 0;
      if (t >= when + ATTACK_S) return level;
      return (level * (t - when)) / ATTACK_S;
    }
    src.onended = () => {
      src.disconnect();
      filter?.disconnect();
      gain.disconnect();
      live.delete(id);
      pool.ended(id);
      finish();
    };

    // Make room first: stolen (or, on a mono instrument, the previous) voices hand over quickly.
    for (const old of pool.start(id, when).release) live.get(old)?.release(when, HANDOVER_S);
    live.set(id, voice);
    src.start(when, hit.zone.startOffsetS);
    if (opts.duration !== undefined) voice.release(when + Math.max(0, opts.duration), meta.releaseMs / 1000);

    return {
      stop(at?: number) {
        voice.release(at ?? ctx.currentTime, meta.releaseMs / 1000);
      },
      done,
    };
  }

  return {
    ...meta,
    get state() {
      return state;
    },
    load(opts = {}) {
      if (inflight) return inflight;
      if (state.kind === 'ready') return Promise.resolve(state);
      const ctx = deps.ctx();
      if (!ctx) {
        state = {
          kind: 'failed',
          reason: 'unsupported',
          attempts: 1,
          at: deps.now(),
        };
        notify();
        return Promise.resolve(state);
      }
      const effects = dispatch({
        type: 'request',
        now: deps.now(),
        user: opts.user ?? false,
        total: zones.length,
      });
      if (!effects.some((e) => e.type === 'fetch-zones')) return Promise.resolve(state);
      inflight = runLoad(ctx);
      return inflight;
    },
    canPlay,
    play,
    stopAll,
    dispose() {
      dispatch({
        type: 'dispose',
      });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
