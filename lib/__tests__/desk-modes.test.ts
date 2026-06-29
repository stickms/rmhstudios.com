import { describe, it, expect } from 'vitest';
import { DESK_MODES, modeById } from '../daily-puzzles/desk-modes';

describe('DESK_MODES', () => {
  it('has the six daily modes in order', () => {
    expect(DESK_MODES.map((m) => m.id)).toEqual([
      'lights-out', 'alibi', 'spectrum', 'outcast', 'chainlink', 'impostor',
    ]);
  });

  it('every mode has a hex accent color', () => {
    for (const m of DESK_MODES) {
      expect(m.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('modeById finds and misses correctly', () => {
    expect(modeById('spectrum')?.title).toBe('Spectrum');
    expect(modeById('nope')).toBeUndefined();
  });
});
