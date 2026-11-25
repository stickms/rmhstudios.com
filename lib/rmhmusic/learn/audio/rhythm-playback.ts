/**
 * "Listen" in Read rhythms: a written pattern played ONCE on the metronome's click sound, one click
 * at the start of each sound (a rest is silence and a tie does not click again), at the lesson's
 * tempo, and the report that it has been HEARD when its last click has left the speaker (the
 * click's time, plus the context's output latency where the browser reports it, plus the click's own
 * length). A pattern that was cancelled or replaced reports nothing, even if its clicks were already
 * scheduled.
 *
 * The clicks are scheduled on the audio clock all at once (a bar is a handful of them), so there is
 * no look-ahead timer to drift; the only timers are the lookouts that tell the screen which note is
 * sounding now ({@link RhythmPlaybackOptions.onNote}), and the one that reports. Nothing runs until
 * `start()`, and `cancel()` silences and clears everything. Client-only: the context is handed in.
 */
import { soundEvents, beatMs, type RhythmPattern } from '../theory/rhythm';
import { contextLatencyMs, startClick, type ClickContext, type ClickVoice } from './clicks';
import { CLICK_S } from './metronome';

/** The wait before the first click (s): long enough for the screen to show it is listening. */
export const PLAYBACK_LEAD_S = 0.3;

export interface RhythmPlayback {
  /** Play `pattern` for question `index`, replacing any before it. False when sound is not ready. */
  start(index: number, pattern: RhythmPattern): boolean;
  /** Silence the pattern and make sure it never reports. Safe to call twice. */
  cancel(): void;
}

export interface RhythmPlaybackOptions {
  ctx: () => ClickContext | null;
  bpm: number;
  /** The whole pattern has sounded. */
  onHeard: (index: number) => void;
  /** A sound is starting (the written note it starts on), or null when the pattern has ended. */
  onNote?: (noteIndex: number | null) => void;
  ready?: () => boolean;
}

/** The click times of a pattern, in seconds from its start: one per sound. */
export function clickOffsetsS(pattern: RhythmPattern, bpm: number): number[] {
  const perS = beatMs(bpm) / 1000;
  return soundEvents(pattern).map((e) => e.start * perS);
}

export function createRhythmPlayback({
  ctx,
  bpm,
  onHeard,
  onNote,
  ready = () => true,
}: RhythmPlaybackOptions): RhythmPlayback {
  const voices: ClickVoice[] = [];
  let timers: ReturnType<typeof setTimeout>[] = [];
  /** Bumped by every start and cancel: a report from an older pattern is stale. */
  let token = 0;

  const stop = () => {
    token++;
    for (const id of timers) clearTimeout(id);
    timers = [];
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
  };

  return {
    start(index, pattern) {
      stop();
      const audio = ctx();
      if (!audio || !ready()) return false;
      const mine = token;
      const events = soundEvents(pattern);
      const offsets = clickOffsetsS(pattern, bpm);
      const t0 = audio.currentTime + PLAYBACK_LEAD_S;
      const latencyMs = contextLatencyMs(audio);
      offsets.forEach((offset, k) => {
        const at = t0 + offset;
        const voice = startClick(audio, at, { freq: k === 0 ? 1500 : 1000, peak: 0.3, clickS: CLICK_S });
        voices.push(voice);
        voice.osc.onended = () => {
          voice.osc.disconnect();
          voice.gain.disconnect();
          const i = voices.indexOf(voice);
          if (i >= 0) voices.splice(i, 1);
        };
        const first = events[k]?.notes[0] ?? null;
        timers.push(
          setTimeout(
            () => {
              if (token === mine) onNote?.(first);
            },
            Math.max(0, (at - audio.currentTime) * 1000 + latencyMs),
          ),
        );
      });
      const last = offsets[offsets.length - 1] ?? 0;
      timers.push(
        setTimeout(
          () => {
            if (token !== mine) return;
            onNote?.(null);
            onHeard(index);
          },
          Math.max(0, (t0 + last - audio.currentTime) * 1000 + latencyMs + CLICK_S * 1000),
        ),
      );
      return true;
    },
    cancel() {
      stop();
    },
  };
}
