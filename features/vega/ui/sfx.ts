/**
 * Project Vega's sound: small synthesised cues in the voice of ward equipment (monitor beeps, a heartbeat, a
 * filtered squelch), so the game needs no sample files. One shared AudioContext (lib/shared/platform.ts).
 */
import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';
import type { SfxName } from '@features/vega/engine/VegaGame';

let level = 0.5;

export function setSfxVolume(v: number) {
  level = Math.max(0, Math.min(1, v));
}

export function unlockSfx() {
  resumeAudioContext();
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain * level, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(ctx: AudioContext, start: number, dur: number, gain: number, freq: number) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (s / 0x7fffffff) * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, start);
  f.frequency.exponentialRampToValueAtTime(freq * 0.4, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * level, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(start);
}

export function playSfx(name: SfxName) {
  if (level <= 0) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  switch (name) {
    case 'place':
      tone(ctx, 660, t, 0.07, 0.18, 'square');
      tone(ctx, 990, t + 0.07, 0.09, 0.14, 'square');
      break;
    case 'upgrade':
      tone(ctx, 520, t, 0.08, 0.16, 'triangle');
      tone(ctx, 780, t + 0.08, 0.08, 0.16, 'triangle');
      tone(ctx, 1040, t + 0.16, 0.12, 0.14, 'triangle');
      break;
    case 'sell':
      tone(ctx, 700, t, 0.1, 0.14, 'triangle', 350);
      break;
    case 'error':
      tone(ctx, 140, t, 0.16, 0.2, 'sawtooth');
      break;
    case 'wave':
      // The monitor's double beep.
      tone(ctx, 880, t, 0.09, 0.2);
      tone(ctx, 880, t + 0.16, 0.09, 0.2);
      break;
    case 'boss':
      // Lub-dub, twice.
      for (const o of [0, 0.7]) {
        tone(ctx, 62, t + o, 0.16, 0.5, 'sine', 40);
        tone(ctx, 54, t + o + 0.2, 0.18, 0.4, 'sine', 36);
      }
      break;
    case 'clear':
      tone(ctx, 784, t, 0.1, 0.14);
      tone(ctx, 1175, t + 0.1, 0.18, 0.12);
      break;
    case 'leak':
      tone(ctx, 90, t, 0.25, 0.4, 'sine', 45);
      noise(ctx, t, 0.12, 0.15, 400);
      break;
    case 'kill':
      noise(ctx, t, 0.07, 0.09, 1600);
      break;
    case 'fire':
      tone(ctx, 1800, t, 0.04, 0.05, 'square', 900);
      break;
    case 'victory':
      [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, t + i * 0.12, 0.3, 0.12, 'triangle'));
      break;
    case 'over':
      // The flatline.
      tone(ctx, 880, t, 1.4, 0.16);
      break;
  }
}
