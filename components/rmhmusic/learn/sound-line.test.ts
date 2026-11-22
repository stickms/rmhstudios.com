import { describe, expect, it } from 'vitest';
import { matchSoundLine, soundLineKey } from './sound-line';

describe('the pitch match sound line', () => {
  it('turns "Loading sound..." into the fallback notice as a new line, not the same one re-wrapped', () => {
    const base = {
      here: true,
      heard: 'loading' as const,
      fellBack: false,
      asking: true,
    };
    const loading = matchSoundLine({
      ...base,
      live: 'loading',
    });
    const fallback = matchSoundLine({
      ...base,
      live: 'ready',
      fellBack: true,
    });
    expect(loading).toBe('loading');
    expect(fallback).toBe('fallback');
    expect(soundLineKey(loading!, 'q0')).not.toBe(soundLineKey(fallback!, 'q0'));
  });

  it('puts a Hear it that could not sound before the fallback notice', () => {
    for (const heard of ['blocked', 'none'] as const)
      expect(
        matchSoundLine({
          here: true,
          heard,
          live: 'ready',
          fellBack: true,
          asking: true,
        }),
      ).toBe(heard);
    expect(
      matchSoundLine({
        here: false,
        heard: 'blocked',
        live: 'ready',
        fellBack: true,
        asking: true,
      }),
    ).toBe('fallback');
    expect(
      matchSoundLine({
        here: true,
        heard: 'ok',
        live: 'ready',
        fellBack: true,
        asking: false,
      }),
    ).toBeNull();
  });
});
