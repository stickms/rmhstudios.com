import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIC_GAIN,
  MAX_MIC_GAIN,
  MIC_GAIN_STEPS,
  MIN_MIC_GAIN,
  clampMicGain,
  gainFromStep,
  stepFromGain,
} from './mic-gain';

describe('mic gain', () => {
  it('runs from the microphone as heard to sixteen times, four steps per doubling', () => {
    expect(gainFromStep(0)).toBe(MIN_MIC_GAIN);
    expect(gainFromStep(4)).toBe(2);
    expect(gainFromStep(8)).toBe(4);
    expect(gainFromStep(MIC_GAIN_STEPS)).toBe(MAX_MIC_GAIN);
  });

  it('round-trips every slider position', () => {
    for (let s = 0; s <= MIC_GAIN_STEPS; s++) expect(stepFromGain(gainFromStep(s))).toBe(s);
  });

  it('repairs anything out of range or not a number', () => {
    expect(clampMicGain(0.2)).toBe(1);
    expect(clampMicGain(99)).toBe(16);
    for (const bad of [Number.NaN, Infinity, '4', null, undefined]) expect(clampMicGain(bad)).toBe(DEFAULT_MIC_GAIN);
    expect(gainFromStep(Number.NaN)).toBe(1);
    expect(gainFromStep(-3)).toBe(1);
    expect(gainFromStep(500)).toBe(16);
  });
});
