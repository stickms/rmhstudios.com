import type { SheetSequence, UVRect } from './types';

const FULL: UVRect = [0, 0, 1, 1];
export interface SheetSample {
  first: UVRect;
  second: UVRect;
  blend: number;
}

/** SHT frames need not be a regular grid, equally timed, or a looping animation. */
export function sampleSheet(
  sequence: SheetSequence | undefined,
  age: number,
  life: number,
  rate: number,
  fitLifetime: boolean,
  asFps: boolean,
  channel = 0,
): SheetSample {
  if (!sequence?.frames.length) return { first: FULL, second: FULL, blend: 0 };
  const frames = sequence.frames;
  const duration = sequence.duration || frames.reduce((sum, f) => sum + f.duration, 0) || 1;
  let time = fitLifetime
    ? Math.max(0, age / Math.max(0.001, life)) * duration
    : asFps
      ? (age * rate * duration) / frames.length
      : age * rate;
  const clamp = sequence.clamp || fitLifetime;
  time = clamp
    ? Math.max(0, Math.min(time, duration - 1e-8))
    : ((time % duration) + duration) % duration;
  let index = 0;
  while (index < frames.length - 1 && time >= frames[index].duration)
    time -= frames[index++].duration;
  const next = index + 1 < frames.length ? index + 1 : clamp ? index : 0;
  return {
    first: frames[index].uv[channel] ?? frames[index].uv[0],
    second: frames[next].uv[channel] ?? frames[next].uv[0],
    blend: Math.max(0, Math.min(1, time / Math.max(1e-8, frames[index].duration))),
  };
}
