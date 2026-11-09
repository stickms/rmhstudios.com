/**
 * The timing check's click track: `count` short beeps on the AudioContext
 * clock, a timer per beat for the UI, and one at the end. Everything it
 * creates is tracked, so `cancel()` (Skip, unmount, a new run) silences the
 * clicks still to come and clears every timer. Client-only: the caller passes
 * the context (from `getAudioContext()`); the module touches nothing at load.
 *
 * Clocks: clicks are scheduled on `ctx.currentTime` (seconds) while note
 * events carry `performance.now()` ms. One offset, measured just before
 * scheduling, maps each click onto the note clock; it is the *scheduled*
 * time, so a measured lag includes the output delay too.
 */

export interface ClickPlan {
  count: number;
  /** Seconds between clicks. */
  beatS: number;
  /** Seconds before the first click. */
  leadS: number;
  /** Length of each click, seconds. */
  clickS: number;
}

export interface ScheduledClicks {
  /** Each click's time on the `performance.now()` clock, ms. */
  clicks: number[];
  /** Silence every click not yet played and clear every timer; idempotent. */
  cancel(): void;
}

type ClickContext = Pick<
  BaseAudioContext,
  'currentTime' | 'createOscillator' | 'createGain' | 'destination'
>;

export function scheduleClicks(
  ctx: ClickContext,
  plan: ClickPlan,
  on: { beat(i: number): void; end(): void },
): ScheduledClicks {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  const clicks: number[] = [];

  // The one clock conversion (see the docblock).
  const offsetMs = performance.now() - ctx.currentTime * 1000;
  const t0 = ctx.currentTime + plan.leadS;
  for (let i = 0; i < plan.count; i++) {
    const at = t0 + i * plan.beatS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = i === 0 ? 1500 : 1000;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.3, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + plan.clickS);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + plan.clickS);
    const voice = { osc, gain };
    voices.push(voice);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      const k = voices.indexOf(voice);
      if (k >= 0) voices.splice(k, 1);
    };
    const clickMs = at * 1000 + offsetMs;
    clicks.push(clickMs);
    timers.push(setTimeout(() => on.beat(i), clickMs - performance.now()));
  }
  const endMs = clicks[plan.count - 1] + plan.beatS * 1000;
  timers.push(setTimeout(() => on.end(), endMs - performance.now()));

  return {
    clicks,
    cancel() {
      for (const id of timers) clearTimeout(id);
      timers.length = 0;
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
  };
}
