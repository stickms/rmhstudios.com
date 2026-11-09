/**
 * The 4/4-versus-3/4 lesson's sound: a bar pattern played by the metronome — {@link PATTERN_BARS}
 * bars of `beatsPerBar` clicks, the first of each bar accented, then one closing downbeat so the
 * last bar's length can be heard too — and the report that it has been HEARD, once, when that
 * last click has sounded. A pattern that was cancelled or replaced reports nothing, even if its
 * last click was already scheduled. Client-only; the context is handed in.
 */
import type { ClickContext } from './clicks';
import { CLICK_S, createMetronome, type Metronome } from './metronome';

/** Whole bars before the closing downbeat. */
export const PATTERN_BARS = 2;

export interface PatternPlayback {
  /**
   * Play the pattern for question `index`, replacing any before it. False when sound is not ready
   * (nothing will be heard).
   */
  start(index: number, beatsPerBar: number): boolean;
  /** Silence the pattern and make sure it never reports. Safe to call twice. */
  cancel(): void;
}

export function createPatternPlayback({
  ctx,
  bpm,
  onHeard,
  ready = () => true,
}: {
  ctx: () => ClickContext | null;
  bpm: number;
  /** The whole pattern has sounded. */
  onHeard: (index: number) => void;
  /** Whether sound can play now (the context is running). */
  ready?: () => boolean;
}): PatternPlayback {
  let metronome: Metronome | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every start and cancel: a report from an older pattern is stale. */
  let token = 0;

  const stop = () => {
    token++;
    clearTimeout(timer);
    timer = undefined;
    metronome?.stop();
    metronome = null;
  };

  return {
    start(index, beatsPerBar) {
      stop();
      const audio = ctx();
      if (!audio || !ready()) return false;
      const mine = token;
      const clicks = PATTERN_BARS * beatsPerBar + 1;
      let seen = 0;
      const m = createMetronome(audio, {
        bpm,
        beatsPerBar,
        onBeat: (_beat, _bar, at) => {
          if (++seen !== clicks) return;
          // The last click: let it sound, then stop the metronome before it schedules another.
          timer = setTimeout(
            () => {
              if (token !== mine) return;
              timer = undefined;
              metronome?.stop();
              metronome = null;
              onHeard(index);
            },
            Math.max(0, at - performance.now()) + CLICK_S * 1000,
          );
        },
      });
      metronome = m;
      m.start();
      return true;
    },
    cancel: stop,
  };
}
