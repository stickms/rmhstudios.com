import { describe, expect, it } from 'vitest';
import { HARMONIC_GAME_ID } from './index';

describe('harmonic-game scaffold', () => {
  it('exposes its game id', () => {
    expect(HARMONIC_GAME_ID).toBe('harmonic');
  });
});
