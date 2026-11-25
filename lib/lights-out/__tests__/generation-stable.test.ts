import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../lights-out';
import { createSeededRng } from '../seed';
import { getDailyShape } from '../shapes';

/**
 * The daily board for a date, every stored `lo-1` replay and every speedrun verification are rebuilt from the seed with
 * `generatePuzzle`. The exact solver replaced the old 15-cell brute force for what a player sees, but generation still
 * asks the old one, so no seed may produce a different board. The digest was taken from the pre-solver code.
 */
describe('generatePuzzle stays seed-stable', () => {
  it('rebuilds the same boards for seeds 0..999', { timeout: 60_000 }, () => {
    const h = createHash('sha256');
    for (let seed = 0; seed < 1000; seed++) {
      h.update(JSON.stringify(generatePuzzle(createSeededRng(seed), getDailyShape(seed))));
    }
    expect(h.digest('hex')).toBe('08f350a49348ddb01707189956520c1d78b402ec16acc1ecf764f458fc35ecd3');
  });
});
