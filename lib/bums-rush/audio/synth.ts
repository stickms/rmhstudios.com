/**
 * Bum's Rush synthesized sound fallbacks.
 *
 * There are no audio assets in this repo, so every sound must have a procedural
 * stand-in. Sounds are short and cheap to keep the budget tight. This is what
 * actually ships in v1; the sprite loader is the path for real assets later.
 *
 * Design doc: docs/plans/2026-08-08-bums-rush-design.md §14.
 */

import { getContext } from './bus';

/**
 * Play a pen click (grip connect) — a short, bright click.
 * Uses a filtered noise burst.
 */
export function playSynthClick(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.04;

  // Generate noise (filtered white noise).
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Fill with white noise.
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  // Play through a high-pass filter to make it "clicky".
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 8000;

  // Amplitude envelope: fast attack, exponential decay.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.01, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(when);
  source.stop(when + duration);
}

/**
 * Play a paper tear (grip near breaking) — sweeping noise with rising pitch.
 * The pitch rises with tension as grip breaks approach.
 *
 * `tension` is 0..1 (0 = no tension, 1 = at break).
 */
export function playSynthTear(tension: number, time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.15 + tension * 0.1; // Longer tear as tension increases.

  // Noise with pitch envelope rising from 2 kHz to 5 kHz.
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Filtered noise (envelope sweeps the filter frequency).
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  // Frequency rises with tension.
  const startFreq = 2000;
  const endFreq = 2000 + tension * 3000;
  filter.frequency.setValueAtTime(startFreq, when);
  filter.frequency.linearRampToValueAtTime(endFreq, when + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, when);
  gain.gain.linearRampToValueAtTime(0.4 * tension, when + duration * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.05, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(when);
  source.stop(when + duration);
}

/**
 * Play a swing whoosh — filtered noise swept by velocity.
 * Faster swings produce higher-pitched whooshes.
 *
 * `speed` is 0..1 (0 = slow, 1 = very fast).
 */
export function playSynthWhoosh(speed: number, time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.08 + (1 - speed) * 0.08; // Faster = shorter.

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  // Higher speed = higher frequency whoosh.
  filter.frequency.value = 2000 + speed * 2000;
  filter.Q.value = 1.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, when);
  gain.gain.exponentialRampToValueAtTime(0.02, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(when);
  source.stop(when + duration);
}

/**
 * Play an impact sound — bass-heavy impulse.
 * Used for collisions and impacts.
 */
export function playSynthImpact(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.12;

  // Short sine wave at low frequency for a "thump".
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, when);
  osc.frequency.exponentialRampToValueAtTime(80, when + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.02, when + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(when);
  osc.stop(when + duration);
}

/**
 * Play a death crumple — chaotic noise burst.
 * Paper crumpled into a ball, hard.
 */
export function playSynthCrumple(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.35;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Heavy white noise.
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 3000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, when);
  gain.gain.exponentialRampToValueAtTime(0.05, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(when);
  source.stop(when + duration);
}

/**
 * Play a respawn sound — pen drawing a quick circle.
 * A short, rising pitch with a sketchy quality.
 */
export function playSynthRespawn(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.2;

  // Quick pitch ramp up.
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(600, when);
  osc.frequency.linearRampToValueAtTime(1200, when + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, when);
  gain.gain.exponentialRampToValueAtTime(0.01, when + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(when);
  osc.stop(when + duration);
}

/**
 * Play a highlighter squeak (objective completed) — high-pitched chirp.
 */
export function playSynthObjective(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.25;

  // High sine wave with a slight frequency modulation.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2400, when);
  osc.frequency.linearRampToValueAtTime(3200, when + duration * 0.5);
  osc.frequency.linearRampToValueAtTime(2200, when + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, when);
  gain.gain.exponentialRampToValueAtTime(0.01, when + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(when);
  osc.stop(when + duration);
}

/**
 * Play a parcel found sound — tape peel plus a small bell.
 * Composed of two synth elements.
 */
export function playSynthParcelFound(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;

  // Tape peel: filtered noise descending.
  {
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1500, when);
    filter.frequency.linearRampToValueAtTime(800, when + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, when);
    gain.gain.exponentialRampToValueAtTime(0.05, when + 0.15);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(when);
    source.stop(when + 0.15);
  }

  // Bell chime: high sine wave.
  {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, when + 0.1);
    osc.frequency.exponentialRampToValueAtTime(1400, when + 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, when + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, when + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(when + 0.1);
    osc.stop(when + 0.35);
  }
}

/**
 * Play the level clear sound — a page turn.
 * A rising sweeping sound with a "flutter" quality.
 */
export function playSynthPageTurn(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;
  const duration = 0.35;

  // Noise swept upward in frequency.
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2000, when);
  filter.frequency.linearRampToValueAtTime(4000, when + duration);
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, when);
  gain.gain.exponentialRampToValueAtTime(0.05, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(when);
  source.stop(when + duration);
}

/**
 * Play Inkblot's arrival sound — a cat's chirrup plus pencil rolling.
 * Composed of two elements.
 */
export function playSynthInkblot(time?: number): void {
  const ctx = getContext();
  if (!ctx) return;

  const when = time ?? ctx.currentTime;

  // Cat chirrup: a descending pitch with a modulated envelope.
  {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, when);
    osc.frequency.linearRampToValueAtTime(400, when + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, when);
    gain.gain.linearRampToValueAtTime(0.25, when + 0.05);
    gain.gain.linearRampToValueAtTime(0.1, when + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(when);
    osc.stop(when + 0.2);
  }

  // Pencil rolling: brief noise burst.
  {
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when + 0.15);
    gain.gain.linearRampToValueAtTime(0.12, when + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.02, when + 0.3);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(when + 0.15);
    source.stop(when + 0.3);
  }
}
