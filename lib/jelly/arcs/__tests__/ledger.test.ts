import { describe, expect, it } from 'vitest';

import { FLASH_LEDGER } from '../../tiers';
import { createFlashLedger } from '../ledger';

/** Brute force: the most onsets inside any half-open window [t, t + w). */
function maxInWindow(onsets: number[], w: number): number {
  let max = 0;
  for (const start of onsets) {
    max = Math.max(max, onsets.filter((t) => t >= start && t < start + w).length);
  }
  return max;
}

describe('flash ledger (WCAG 2.3.1)', () => {
  it('defaults to the site-wide 3 onsets per 1000ms', () => {
    const ledger = createFlashLedger();
    expect(ledger.maxOnsets).toBe(FLASH_LEDGER.maxOnsets);
    expect(ledger.windowMs).toBe(FLASH_LEDGER.windowMs);
  });

  it('a 20 Hz click storm over 5s never exceeds 3 onsets in any 1000ms window', () => {
    const ledger = createFlashLedger();
    const admitted: number[] = [];
    for (let t = 0; t <= 5000; t += 50) {
      // Each click asks for a bolt plus two re-strikes.
      for (const dt of [0, 40, 125]) if (ledger.tryOnset(t + dt)) admitted.push(t + dt);
    }
    expect(maxInWindow(admitted, 1000)).toBeLessThanOrEqual(3);
    // …and it is not starved: the storm still gets ~3 flashes a second.
    expect(admitted.length).toBeGreaterThanOrEqual(15);
  });

  it('holds under random arrival times', () => {
    let seed = 99;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const ledger = createFlashLedger();
    const admitted: number[] = [];
    let t = 0;
    for (let k = 0; k < 3000; k++) {
      t += rand() * 120;
      if (ledger.tryOnset(t)) admitted.push(t);
    }
    expect(maxInWindow(admitted, 1000)).toBeLessThanOrEqual(3);
  });

  it('frees up once the oldest onset leaves the window', () => {
    const ledger = createFlashLedger();
    expect(ledger.tryOnset(0)).toBe(true);
    expect(ledger.tryOnset(10)).toBe(true);
    expect(ledger.tryOnset(20)).toBe(true);
    expect(ledger.canOnset(500)).toBe(false);
    expect(ledger.tryOnset(999)).toBe(false);
    expect(ledger.nextFreeAt(999)).toBe(1000);
    expect(ledger.tryOnset(1000)).toBe(true);
    expect(ledger.count(1000)).toBe(3);
  });

  it('canOnset does not record', () => {
    const ledger = createFlashLedger({ maxOnsets: 1 });
    expect(ledger.canOnset(0)).toBe(true);
    expect(ledger.canOnset(0)).toBe(true);
    expect(ledger.tryOnset(0)).toBe(true);
    expect(ledger.canOnset(1)).toBe(false);
  });

  it('a clock running backwards cannot reopen the window', () => {
    const ledger = createFlashLedger();
    ledger.tryOnset(5000);
    ledger.tryOnset(5001);
    ledger.tryOnset(5002);
    expect(ledger.tryOnset(0)).toBe(false);
    expect(ledger.tryOnset(5500)).toBe(false);
  });

  it('reset forgets every onset', () => {
    const ledger = createFlashLedger();
    for (let i = 0; i < 3; i++) ledger.tryOnset(i);
    ledger.reset();
    expect(ledger.tryOnset(3)).toBe(true);
  });
});
