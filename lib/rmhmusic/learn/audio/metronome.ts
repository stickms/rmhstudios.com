/**
 * A metronome on the shared AudioContext's clock.
 *
 * **How it keeps time.** A JavaScript timer is never exact (a busy page, a background tab), but the
 * audio clock is. So the timer is only a lookout: every {@link TIMER_MS} it schedules every click
 * that falls within the next {@link LOOKAHEAD_S} on `ctx.currentTime`, and the audio thread plays
 * each at its exact time. There is no `setInterval` (a chain of `setTimeout`s that re-arms itself,
 * so a slow tick delays the lookout, never a click) and the grid is computed from the start time,
 * never by adding the interval to itself, so there is no accumulated rounding drift. A timer that
 * fires late schedules the clicks it missed, in order, each no earlier than `ctx.currentTime`:
 * nothing is ever scheduled in the past, and the beats after the stall are back on the grid.
 *
 * **Nothing runs at rest.** Until `start()` there is no timer and no node; `stop()` clears the
 * timer and silences every click not yet played, and is safe to call twice. A lesson stops it on
 * unmount. The caller wakes a suspended context first (`resumeAudio`): a suspended context's clock
 * does not advance, so nothing would sound, and `beatTimes()` would be wrong once it resumed. If
 * the context stops mid-run the caller stops the run and starts a new one.
 *
 * **Which clock.** `beatTimes()` and `onBeat`'s `at` are in ms on the `performance.now()` clock that
 * note events carry, via the one offset `clicks.ts` documents, measured once at `start()`. They are
 * when each click was SCHEDULED to sound (or, for one that was late, when it was started), not when
 * it left the speaker: add the output delay when comparing with a human (see `scoring/timing.ts`).
 * `onBeat` fires when a click is scheduled, up to the look-ahead before it is heard, so a screen
 * that shows the beat waits until `at`.
 *
 * The click is a neutral synth click (`clicks.ts`), not a note of the instrument. Client-only: the
 * caller passes the context; nothing is touched at load.
 */
import { clockOffsetMs, startClick, type ClickContext, type ClickVoice } from './clicks';

/** The slowest and fastest tempi, beats per minute. */
export const BPM_MIN = 30;
export const BPM_MAX = 240;
/** The tempo when none (or a nonsense one) is given. */
export const BPM_DEFAULT = 80;
/** How far ahead of the audio clock clicks are scheduled (s). */
export const LOOKAHEAD_S = 0.1;
/** How often the lookout wakes (ms). */
export const TIMER_MS = 25;
/** How long one click sounds (s). */
export const CLICK_S = 0.05;
/** Default wait before the first click (s). */
export const LEAD_S = 0.1;

/** `bpm` kept in 30–240; anything that is not a number is the default tempo. */
export function clampBpm(bpm: number): number {
  if (Number.isNaN(bpm)) return BPM_DEFAULT;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
}

/** Seconds from one beat to the next. */
export function beatIntervalS(bpm: number): number {
  return 60 / clampBpm(bpm);
}

/** Where the `index`th click since the start falls: its beat in the bar and the bar (both from 0). */
export function beatIndexToPosition(
  index: number,
  beatsPerBar: number,
): { beat: number; bar: number } {
  const per = Number.isFinite(beatsPerBar) ? Math.max(1, Math.floor(beatsPerBar)) : 1;
  return { beat: index % per, bar: Math.floor(index / per) };
}

/** The downbeat (beat 0 of a bar) is higher and louder than the others. */
export function accentOf(beat: number): { freq: number; peak: number } {
  return beat === 0 ? { freq: 1500, peak: 0.4 } : { freq: 1000, peak: 0.25 };
}

export interface MetronomeOptions {
  bpm: number;
  beatsPerBar: number;
  /** A click was scheduled: its beat in the bar, the bar, and its time (ms, performance clock). */
  onBeat?(beat: number, bar: number, at: number): void;
}

export interface Metronome {
  /** Begin after `leadS` seconds (default 0.1). The first click is scheduled during the call. */
  start(leadS?: number): void;
  /** Silence the clicks still to come and stop the timer; safe to call twice. */
  stop(): void;
  readonly running: boolean;
  /** Every click of the run so far, ms on the `performance.now()` clock, in order. */
  beatTimes(): number[];
}

export function createMetronome(ctx: ClickContext, opts: MetronomeOptions): Metronome {
  const intervalS = beatIntervalS(opts.bpm);
  const perBar = opts.beatsPerBar;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let voices: ClickVoice[] = [];
  let times: number[] = [];
  let offsetMs = 0;
  let startS = 0;
  let index = 0;

  /** Schedule click `index` on its grid time (or now, if the grid time has passed). */
  const scheduleNext = () => {
    const at = Math.max(startS + index * intervalS, ctx.currentTime);
    const { beat, bar } = beatIndexToPosition(index, perBar);
    const voice = startClick(ctx, at, { ...accentOf(beat), clickS: CLICK_S });
    voices.push(voice);
    voice.osc.onended = () => {
      voice.osc.disconnect();
      voice.gain.disconnect();
      const k = voices.indexOf(voice);
      if (k >= 0) voices.splice(k, 1);
    };
    const atMs = at * 1000 + offsetMs;
    times.push(atMs);
    index++;
    opts.onBeat?.(beat, bar, atMs);
  };

  const tick = () => {
    if (!running) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    while (running && startS + index * intervalS < horizon) scheduleNext();
    if (running) timer = setTimeout(tick, TIMER_MS);
  };

  return {
    start(leadS = LEAD_S) {
      if (running) return;
      running = true;
      voices = [];
      times = [];
      index = 0;
      offsetMs = clockOffsetMs(ctx);
      startS = ctx.currentTime + (Number.isFinite(leadS) ? Math.max(0, leadS) : LEAD_S);
      // The first click is always scheduled now, so its time is known to the caller at once.
      scheduleNext();
      tick();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      timer = undefined;
      for (const { osc, gain } of voices.splice(0)) {
        osc.onended = null;
        try {
          osc.stop();
        } catch {
          // Already stopped.
        }
        osc.disconnect();
        gain.disconnect();
      }
    },
    get running() {
      return running;
    },
    beatTimes: () => [...times],
  };
}
