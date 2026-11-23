/**
 * Signal Forge's sound: a few synthesised blips (no samples): the metronome tick in Timed mode, a card strike
 * pitched by its waveform, the Forge Burst swell and the Glitch hiss. Uses the site's one AudioContext
 * (`getAudioContext()`); muted state is remembered per browser.
 */
import { readString, writeString } from '@/lib/core/persist';
import { getAudioContext } from '@/lib/shared/platform';
import type { Timing, Waveform } from '@features/signal-forge/engine/types';

const KEY = 'rmh:signal-forge:muted';
let muted = readString(KEY) === '1';

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  writeString(KEY, m ? '1' : '0');
}

function ac(): AudioContext | null {
  if (muted) return null;
  const a = getAudioContext();
  if (a && a.state === 'suspended') void a.resume().catch(() => {});
  return a;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

const WAVE_OSC: Record<Waveform | 'any', OscillatorType> = { pulse: 'square', sine: 'sine', saw: 'sawtooth', noise: 'triangle', any: 'triangle' };
const WAVE_HZ: Record<Waveform | 'any', number> = { pulse: 330, sine: 392, saw: 440, noise: 262, any: 494 };

export const sfx = {
  tick(accent: boolean): void {
    tone(accent ? 1320 : 990, 0.04, 'square', 0.035);
  },
  play(wave: Waveform | 'any', timing: Timing | 'off'): void {
    const hz = WAVE_HZ[wave] * (timing === 'perfect' ? 2 : 1);
    tone(hz, timing === 'off' ? 0.08 : 0.14, timing === 'off' ? 'triangle' : WAVE_OSC[wave], timing === 'off' ? 0.03 : 0.06);
  },
  burst(): void {
    tone(110, 0.35, 'sawtooth', 0.08, 440);
    tone(220, 0.3, 'square', 0.04, 660);
  },
  glitch(): void {
    tone(90, 0.12, 'square', 0.05, 60);
  },
  vent(): void {
    tone(600, 0.25, 'triangle', 0.05, 180);
  },
};
