import { describe, expect, it } from 'vitest';
import {
  INELIGIBILITY_ORDER,
  evaluateEligibility,
  isEligibleFor,
  shouldCaptureBefore,
  type EligibilityInputs,
} from '../eligibility';

const ok: EligibilityInputs = {
  flagEnabled: true,
  reducedMotion: false,
  webgl2: true,
  chunkReady: true,
};

describe('evaluateEligibility', () => {
  it('is eligible when every input allows it', () => {
    expect(evaluateEligibility(ok)).toBeNull();
    expect(isEligibleFor(ok)).toBe(true);
  });

  it.each([
    ['flag-off', { flagEnabled: false }],
    ['reduced-motion', { reducedMotion: true }],
    ['no-webgl2', { webgl2: false }],
    ['no-webgl2', { webgl2: null }],
    ['chunk-not-ready', { chunkReady: false }],
  ] as const)('reports %s', (reason, patch) => {
    const inputs = { ...ok, ...patch };
    expect(evaluateEligibility(inputs)).toBe(reason);
    expect(isEligibleFor(inputs)).toBe(false);
  });

  it('first failing row wins, in the documented order', () => {
    const allBad: EligibilityInputs = {
      flagEnabled: false,
      reducedMotion: true,
      webgl2: false,
      chunkReady: false,
    };
    expect(evaluateEligibility(allBad)).toBe('flag-off');
    expect(evaluateEligibility({ ...allBad, flagEnabled: true })).toBe('reduced-motion');
    expect(evaluateEligibility({ ...allBad, flagEnabled: true, reducedMotion: false })).toBe(
      'no-webgl2',
    );
    expect(INELIGIBILITY_ORDER).toEqual([
      'flag-off',
      'reduced-motion',
      'no-webgl2',
      'chunk-not-ready',
    ]);
  });
});

describe('shouldCaptureBefore', () => {
  it('captures while only the chunk is missing', () => {
    expect(shouldCaptureBefore({ ...ok, chunkReady: false })).toBe(true);
    expect(shouldCaptureBefore(ok)).toBe(true);
  });
  it('does not capture for any other reason', () => {
    expect(shouldCaptureBefore({ ...ok, flagEnabled: false })).toBe(false);
    expect(shouldCaptureBefore({ ...ok, reducedMotion: true })).toBe(false);
    expect(shouldCaptureBefore({ ...ok, webgl2: null })).toBe(false);
  });
});
