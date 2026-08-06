/**
 * The debt counter's noises. Client-only, synthesised, mutable.
 *
 * Every sound here is generated with oscillators and a noise buffer rather than
 * shipped as audio files. Six one-shots as `.mp3`s would be a few hundred
 * kilobytes on a page whose entire point is a number going up; as Web Audio
 * graphs they are a couple of hundred lines and nothing to download.
 *
 * ## Three rules this file exists to keep
 *
 *  1. **One AudioContext.** Always `getAudioContext()` from `lib/shared/platform`
 *     — browsers cap contexts per document (Chrome allows six) and a module that
 *     calls `new AudioContext()` is one of six things that can take the page
 *     down. It returns `null` on a device with no Web Audio, and `null` means
 *     "this device is silent", not "throw".
 *  2. **Nothing plays before a gesture.** Autoplay policy suspends the context
 *     until the user interacts, so a sound scheduled on page load is not quiet —
 *     it is *lost*. Every entry point calls `resumeAudioContext()` first, and the
 *     sounds that fire without a gesture (a stranger's addition arriving over
 *     SSE) simply do not play until the reader has touched the page.
 *  3. **Mute is honoured before anything is built.** Not by muting a gain node —
 *     by returning early. A muted page should allocate no oscillators at all.
 *
 * The preference is read synchronously from `localStorage` on first use so the
 * very first click is already correct, and published through
 * `useSyncExternalStore` so the toggle re-renders.
 */

'use client';

import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

const STORAGE_KEY = 'rmh-kaikai-debt-muted';

/* -------------------------------------------------------------------------- */
/* Mute preference                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Default OFF (unmuted).
 *
 * A page that opens silent and needs a toggle found before it does anything is a
 * page nobody hears. Autoplay policy already guarantees nothing makes a sound
 * until the reader has interacted, so "unmuted by default" cannot ambush anyone
 * — the first noise is always a consequence of something they did.
 */
let muted = false;
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode / storage disabled. Stay with the default.
  }
}

function emit(): void {
  for (const l of listeners) l();
}

export function isMuted(): boolean {
  load();
  return muted;
}

export function setMuted(next: boolean): void {
  load();
  if (muted === next) return;
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // Preference is still live for this session; it just will not persist.
  }
  emit();
}

export function toggleMuted(): boolean {
  setMuted(!isMuted());
  return isMuted();
}

/** `useSyncExternalStore` subscribe. */
export function subscribeMuted(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * SSR snapshot. Always "unmuted" so the server and the hydrating client agree —
 * reading `localStorage` here would produce a text mismatch on the toggle's
 * label and cost a re-render of the tree. The real value lands right after
 * hydration through the normal state path.
 */
export function getMutedServerSnapshot(): boolean {
  return false;
}

/* -------------------------------------------------------------------------- */
/* Synthesis helpers                                                          */
/* -------------------------------------------------------------------------- */

/** The context, resumed, or `null` when muted or unavailable. One gate for every sound. */
function audio(): AudioContext | null {
  if (isMuted()) return null;
  const ctx = getAudioContext();
  if (!ctx) return null;
  resumeAudioContext();
  // A context still suspended after `resume()` has had no gesture yet. Building
  // a graph now would schedule sound at time zero and dump it all at once the
  // moment the reader first clicks.
  if (ctx.state === 'suspended') return null;
  return ctx;
}

/**
 * Master level for everything in this file.
 *
 * Low on purpose: these are punctuation on a joke page, not a game's mix. Web
 * Audio has no loudness normalisation, so an oscillator at 1.0 is genuinely
 * painful in headphones.
 */
const MASTER_GAIN = 0.12;

interface ToneSpec {
  type: OscillatorType;
  /** Hz at the start and end of the sweep. Equal values hold a pitch. */
  from: number;
  to: number;
  duration: number;
  /** Peak of the envelope, multiplied by {@link MASTER_GAIN}. */
  level?: number;
  /** Seconds from now. Lets a caller stack a chord or a two-note flourish. */
  delay?: number;
}

/**
 * One enveloped oscillator sweep.
 *
 * The envelope is not decoration: an oscillator started and stopped at full gain
 * produces a discontinuity at each end, which is a click — and a click is
 * exactly what a page like this cannot afford, because it reads as a bug rather
 * than as a sound effect.
 */
function tone(ctx: AudioContext, spec: ToneSpec): void {
  const start = ctx.currentTime + (spec.delay ?? 0);
  const end = start + spec.duration;

  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.from, start);
  if (spec.to !== spec.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.to), end);

  const gain = ctx.createGain();
  const peak = MASTER_GAIN * (spec.level ?? 1);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.015, spec.duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
  // Let the nodes fall off the graph on their own. Disconnecting in an `onended`
  // handler is the usual reflex and it buys nothing here: a stopped source node
  // with no references is collectable, and the handler itself is a reference.
}

/** A short burst of filtered noise — the "fire" part of the fire. */
function noise(ctx: AudioContext, duration: number, level: number, sweepTo: number): void {
  const start = ctx.currentTime;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(2400, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), start + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(MASTER_GAIN * level, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

/* -------------------------------------------------------------------------- */
/* The sounds                                                                 */
/* -------------------------------------------------------------------------- */

/** A member's debt lands: cash-register two-note, then a laser crack. */
export function playDebtAdded(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, { type: 'square', from: 880, to: 880, duration: 0.07, level: 0.7 });
  tone(ctx, { type: 'square', from: 1320, to: 1320, duration: 0.1, level: 0.6, delay: 0.07 });
  tone(ctx, { type: 'sawtooth', from: 2400, to: 180, duration: 0.22, level: 0.5, delay: 0.1 });
  noise(ctx, 0.3, 0.35, 200);
}

/** Somebody else's debt arrives over the wire: the same idea, quieter and lower. */
export function playRemoteDebt(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, { type: 'triangle', from: 660, to: 990, duration: 0.12, level: 0.45 });
  tone(ctx, { type: 'sawtooth', from: 1600, to: 220, duration: 0.18, level: 0.3, delay: 0.06 });
}

/** The appraiser declined. A flat, unimpressed two-note fall. */
export function playRejected(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, { type: 'square', from: 320, to: 320, duration: 0.09, level: 0.5 });
  tone(ctx, { type: 'square', from: 190, to: 190, duration: 0.18, level: 0.5, delay: 0.1 });
}

/** A page of history is conjured out of the void. */
export function playLedgerExtended(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, { type: 'sine', from: 180, to: 720, duration: 0.34, level: 0.42 });
  noise(ctx, 0.4, 0.22, 120);
}

/** The Q&A answer starts arriving. Deliberately tiny — it fires often. */
export function playAnswerStart(): void {
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, { type: 'sine', from: 1200, to: 1600, duration: 0.07, level: 0.3 });
}

/**
 * The ambient laser/fire crackle, fired on a loose interval by the FX layer.
 *
 * Silent under reduced motion. Somebody who has asked the OS to stop things
 * moving has not asked for the accompanying soundtrack either — and unlike the
 * event sounds above, this one is not a response to anything they did, which is
 * exactly the category that becomes irritating rather than fun.
 */
export function playAmbientCrackle(): void {
  if (prefersReducedMotion()) return;
  const ctx = audio();
  if (!ctx) return;
  const pitch = 900 + Math.random() * 1500;
  tone(ctx, { type: 'sawtooth', from: pitch, to: pitch * 0.25, duration: 0.13, level: 0.16 });
  noise(ctx, 0.11, 0.1, 400);
}
