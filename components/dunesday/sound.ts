'use client';

/**
 * Tiny synthesized UI sounds in the spirit of the era: a soft gel "bloop" for
 * toggles, a watery pop for bubbles, a rising glassy chime when a title is
 * ticked off, and a little fanfare for a finished phase.
 *
 * Synthesized rather than sampled so there is nothing to download and nothing
 * to license. Everything goes through the site's shared AudioContext
 * (`getAudioContext`), never `new AudioContext()` — browsers cap the number a
 * page may create. Muted state is the viewer's choice, kept in localStorage.
 */

import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';

const KEY = 'dunesday:sound';
let muted: boolean | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(KEY) === 'off';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(KEY, next ? 'off' : 'on');
  } catch {
    // Storage blocked: the choice holds for this visit.
  }
}

function prefersQuiet(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface Tone {
  freq: number;
  to?: number;
  at?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function play(tones: Tone[]): void {
  if (isMuted() || prefersQuiet()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudioContext();
  const start = ctx.currentTime + 0.005;
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
  for (const t of tones) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const t0 = start + (t.at ?? 0);
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, t0);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, t0 + t.dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(t.gain ?? 0.8, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + t.dur + 0.02);
  }
}

export const sfx = {
  /** Toggle / segmented control. */
  bloop: () => play([{ freq: 520, to: 880, dur: 0.09, gain: 0.5 }]),
  /** Soft tick for small buttons. */
  tick: () => play([{ freq: 1200, to: 900, dur: 0.04, type: 'triangle', gain: 0.35 }]),
  /** A soap bubble popping. */
  pop: () =>
    play([
      { freq: 900, to: 1800, dur: 0.06, gain: 0.6 },
      { freq: 2400, to: 3200, at: 0.02, dur: 0.04, type: 'triangle', gain: 0.25 },
    ]),
  /** A title ticked off: a rising glassy arpeggio. */
  chime: () =>
    play([
      { freq: 659.25, dur: 0.35, gain: 0.5 },
      { freq: 830.61, at: 0.07, dur: 0.35, gain: 0.45 },
      { freq: 987.77, at: 0.14, dur: 0.5, gain: 0.45 },
      { freq: 1318.5, at: 0.21, dur: 0.6, type: 'triangle', gain: 0.2 },
    ]),
  /** Un-ticking: a gentle falling pair. */
  undo: () =>
    play([
      { freq: 700, dur: 0.12, gain: 0.35 },
      { freq: 520, at: 0.08, dur: 0.16, gain: 0.3 },
    ]),
  /** A phase or the whole marathon done. */
  fanfare: () =>
    play([
      { freq: 523.25, dur: 0.25, gain: 0.45 },
      { freq: 659.25, at: 0.12, dur: 0.25, gain: 0.45 },
      { freq: 783.99, at: 0.24, dur: 0.25, gain: 0.45 },
      { freq: 1046.5, at: 0.36, dur: 0.8, gain: 0.5 },
      { freq: 1567.98, at: 0.36, dur: 0.8, type: 'triangle', gain: 0.15 },
    ]),
  /** Window minimise/restore. */
  swoosh: () => play([{ freq: 300, to: 1400, dur: 0.18, type: 'triangle', gain: 0.25 }]),
  /** Startup chime for the boot splash. */
  startup: () =>
    play([
      { freq: 392, dur: 1.4, gain: 0.3 },
      { freq: 493.88, at: 0.15, dur: 1.3, gain: 0.28 },
      { freq: 587.33, at: 0.3, dur: 1.2, gain: 0.28 },
      { freq: 783.99, at: 0.45, dur: 1.4, type: 'triangle', gain: 0.18 },
    ]),
};
