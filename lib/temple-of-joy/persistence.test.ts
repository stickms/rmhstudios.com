import { describe, expect, it } from 'vitest';
import { createInitialState } from './store';
import { exportSave, importSave, readSave, stateToSave } from './persistence';

describe('temple save validation', () => {
  const enc = (o: unknown) => btoa(JSON.stringify(o));

  it('round-trips a real save', () => {
    const state = { ...createInitialState(), joy: 123 };
    expect(importSave(exportSave(state))?.joy).toBe(123);
    expect(readSave(stateToSave(state))?.joy).toBe(123);
  });

  // These used to load as an empty temple, replacing the player's real one.
  it.each([
    ['bare version', { version: 3 }],
    ['another game', { version: 2, score: 5 }],
    ['junk fields', { version: 3, joy: 'x', sources: [1] }],
    ['non-array blessings', { ...stateToSave(createInitialState()), blessings: 5 }],
  ])('rejects %s', (_n, doc) => {
    expect(importSave(enc(doc))).toBeNull();
  });
});
