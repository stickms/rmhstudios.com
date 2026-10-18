import { describe, expect, it } from 'vitest';
import { remixEntities } from './ngplus';
import type { EntitySpec } from './types';

const specs: EntitySpec[] = [
  { kind: 'chip', id: 'c1', col: 3, row: 4 },
  { kind: 'chip', id: 'c2', col: 9, row: 2 },
  { kind: 'chip', id: 'c3', col: 14, row: 8 },
  { kind: 'key', id: 'key1', col: 20, row: 5 },
  { kind: 'laser', id: 'l1', col: 6, row: 6, phase: 0.5, onTime: 1, offTime: 1 },
];

describe('remixEntities', () => {
  it('is deterministic for a seed and never invents positions', () => {
    const a = remixEntities('lobby', specs, 42);
    expect(a).toEqual(remixEntities('lobby', specs, 42));
    const original = new Set(
      specs.filter((s) => s.kind === 'chip').map((s) => `${s.col},${s.row}`),
    );
    const moved = a.filter((s) => s.kind === 'chip').map((s) => `${s.col},${s.row}`);
    expect(new Set(moved)).toEqual(original);
  });

  it('leaves keys and ids alone and keeps the laser phase in range', () => {
    for (let seed = 1; seed < 50; seed++) {
      const out = remixEntities('pokerHall', specs, seed);
      expect(out.find((s) => s.kind === 'key')).toEqual(specs[3]);
      expect(out.map((s) => s.id)).toEqual(specs.map((s) => s.id));
      const phase = out.find((s) => s.kind === 'laser')!.phase!;
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});
