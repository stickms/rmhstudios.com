import { describe, expect, it } from 'vitest';
import { normalizePresetValues, valuesByteLength } from '@/lib/rmhbox/presets';
import type { GameSettingsSchema } from '@/lib/rmhbox/types';

const schema: GameSettingsSchema = [
  { key: 'rounds', type: 'integer', label: 'Rounds', description: '', default: 3, min: 1, max: 5 },
  { key: 'bonus', type: 'boolean', label: 'Bonus', description: '', default: true },
  { key: 'mode', type: 'select', label: 'Mode', description: '', default: 'easy', options: ['easy', 'hard'] },
];

describe('normalizePresetValues', () => {
  it('leaves values that still fit the schema untouched and does not flag a reset', () => {
    expect(normalizePresetValues(schema, { rounds: 4, bonus: false, mode: 'hard' })).toEqual({
      values: { rounds: 4, bonus: false, mode: 'hard' },
      reset: false,
    });
  });

  it('drops a key the schema no longer has and flags the reset', () => {
    const r = normalizePresetValues(schema, { rounds: 4, bonus: false, mode: 'hard', timer: 30 });
    expect(r.values).toEqual({ rounds: 4, bonus: false, mode: 'hard' });
    expect(r.reset).toBe(true);
  });

  it('fills a setting added since the preset was saved with its default', () => {
    const r = normalizePresetValues(schema, { rounds: 2 });
    expect(r.values).toEqual({ rounds: 2, bonus: true, mode: 'easy' });
    expect(r.reset).toBe(true);
  });

  it('clamps a value outside the new bounds and replaces a removed option', () => {
    const r = normalizePresetValues(schema, { rounds: 50, bonus: true, mode: 'insane' });
    expect(r.values).toEqual({ rounds: 5, bonus: true, mode: 'easy' });
    expect(r.reset).toBe(true);
  });

  it('treats a non-object as an empty preset', () => {
    for (const raw of [null, 'x', 7, [1, 2]]) {
      expect(normalizePresetValues(schema, raw)).toEqual({
        values: { rounds: 3, bonus: true, mode: 'easy' },
        reset: true,
      });
    }
  });
});

describe('valuesByteLength', () => {
  it('counts bytes of the JSON, not characters', () => {
    expect(valuesByteLength({ a: 1 })).toBe(7);
    expect(valuesByteLength({ a: 'é' })).toBe(10);
  });
});
