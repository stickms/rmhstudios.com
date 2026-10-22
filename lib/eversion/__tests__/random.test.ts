import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_PROJECTION_KEY } from '../constants';
import { resetLastProjection, resolveProjection } from '../random';
import { NAV_TRANSITIONS, PROJECTION_IDS, type ProjectionId } from '../types';
import { seededRandom } from './helpers';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('resolveProjection (S§5.1, S#23)', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    resetLastProjection();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetLastProjection();
  });

  it('a fixed setting returns itself and does not disturb the previous draw', () => {
    for (const id of PROJECTION_IDS) expect(resolveProjection(id)).toBe(id);
    expect(sessionStorage.getItem(LAST_PROJECTION_KEY)).toBeNull();
  });

  it('never repeats the previous draw over 10 000 draws; uniform over the other four (χ²)', () => {
    const rng = seededRandom(2026);
    // Count by (previous → next) so uniformity is tested conditional on `previous`.
    const counts = new Map<ProjectionId, Map<ProjectionId, number>>();
    let prev: ProjectionId | null = null;
    let repeats = 0;
    for (let i = 0; i < 10_000; i++) {
      const next = resolveProjection('random', rng);
      if (next === prev) repeats++;
      if (prev) {
        const row = counts.get(prev) ?? new Map<ProjectionId, number>();
        row.set(next, (row.get(next) ?? 0) + 1);
        counts.set(prev, row);
      }
      prev = next;
    }
    expect(repeats).toBe(0);
    // χ² per previous value: 4 categories, 3 dof; 0.01 critical value 11.345.
    // Seeded, so this is deterministic rather than flaky.
    let worst = 0;
    for (const [from, row] of counts) {
      const total = [...row.values()].reduce((a, b) => a + b, 0);
      const expected = total / 4;
      let chi = 0;
      for (const id of PROJECTION_IDS) {
        if (id === from) continue;
        chi += ((row.get(id) ?? 0) - expected) ** 2 / expected;
      }
      worst = Math.max(worst, chi);
    }
    expect(counts.size).toBe(5);
    expect(worst).toBeLessThan(11.345);
  });

  it('persists the draw under the documented sessionStorage key', () => {
    const got = resolveProjection('random', () => 0);
    expect(sessionStorage.getItem(LAST_PROJECTION_KEY)).toBe(got);
    // …and honours a value written by an earlier page-load.
    sessionStorage.setItem(LAST_PROJECTION_KEY, 'mercator');
    for (let i = 0; i < 20; i++) {
      sessionStorage.setItem(LAST_PROJECTION_KEY, 'mercator');
      expect(resolveProjection('random', seededRandom(i))).not.toBe('mercator');
    }
  });

  it('survives an rng that returns exactly 1 and ignores a corrupt stored value', () => {
    sessionStorage.setItem(LAST_PROJECTION_KEY, 'not-a-projection');
    expect(PROJECTION_IDS).toContain(resolveProjection('random', () => 1));
  });

  it('accepts every NavTransition', () => {
    for (const s of NAV_TRANSITIONS) expect(PROJECTION_IDS).toContain(resolveProjection(s));
  });

  it('still never repeats when sessionStorage throws (module-variable fallback)', () => {
    const boom = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.stubGlobal('sessionStorage', { getItem: boom, setItem: boom, removeItem: boom });
    resetLastProjection();
    const rng = seededRandom(5);
    let prev: ProjectionId | null = null;
    for (let i = 0; i < 500; i++) {
      const next = resolveProjection('random', rng);
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('works when sessionStorage does not exist at all', () => {
    vi.stubGlobal('sessionStorage', undefined);
    resetLastProjection();
    const a = resolveProjection('random', () => 0);
    expect(resolveProjection('random', () => 0)).not.toBe(a);
  });
});
