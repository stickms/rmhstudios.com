import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIC_GAIN,
  DEFAULT_MIC_GATE,
  DEFAULT_MIC_SETTINGS,
  MAX_MIC_GAIN,
  MAX_MIC_GATE,
  MIC_GAIN_STEPS,
  MIC_GATE_STEPS,
  MIN_MIC_GAIN,
  MIN_MIC_GATE,
  clampMicGain,
  clampMicGate,
  gainFromStep,
  gateFromStep,
  isMicHum,
  levelToDb,
  normalizeMicSettings,
  stepFromGain,
  stepFromGate,
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

describe('cutoff', () => {
  it('runs from very sensitive to loud notes only, ten steps per factor of ten', () => {
    expect(gateFromStep(0)).toBe(MIN_MIC_GATE);
    expect(gateFromStep(10)).toBeCloseTo(0.02, 5);
    expect(gateFromStep(MIC_GATE_STEPS)).toBeCloseTo(MAX_MIC_GATE, 5);
  });

  it('round-trips every slider position and passes through the old fixed cutoff', () => {
    for (let s = 0; s <= MIC_GATE_STEPS; s++) expect(stepFromGate(gateFromStep(s))).toBe(s);
    expect(gateFromStep(stepFromGate(DEFAULT_MIC_GATE))).toBeCloseTo(DEFAULT_MIC_GATE, 2);
  });

  it('repairs anything out of range or not a number, and shows a level in decibels', () => {
    expect(clampMicGate(0)).toBe(MIN_MIC_GATE);
    expect(clampMicGate(5)).toBe(MAX_MIC_GATE);
    for (const bad of [Number.NaN, Infinity, '0.01', null, undefined]) expect(clampMicGate(bad)).toBe(DEFAULT_MIC_GATE);
    expect(levelToDb(0.01)).toBe(-40);
    expect(levelToDb(1)).toBe(0);
    expect(levelToDb(0)).toBeLessThan(-100);
  });
});

describe('mic settings', () => {
  it('start automatic, as heard, with the hum filter off', () => {
    expect(DEFAULT_MIC_SETTINGS).toEqual({ auto: true, gain: 1, gate: 0.01, hum: 'off' });
  });

  it('repair field by field, so one bad value does not discard the rest', () => {
    expect(normalizeMicSettings({ auto: false, gain: 99, gate: 'x', hum: '55' })).toEqual({
      auto: false,
      gain: 16,
      gate: DEFAULT_MIC_GATE,
      hum: 'off',
    });
    expect(normalizeMicSettings({})).toEqual(DEFAULT_MIC_SETTINGS);
    expect(normalizeMicSettings({ hum: '60', gain: 2.5, gate: 0.02 })).toMatchObject({
      hum: '60',
      gain: 2.5,
      gate: 0.02,
    });
  });

  it('knows its three hum choices', () => {
    for (const h of ['off', '50', '60']) expect(isMicHum(h)).toBe(true);
    for (const h of ['55', 50, null, undefined]) expect(isMicHum(h)).toBe(false);
  });
});
