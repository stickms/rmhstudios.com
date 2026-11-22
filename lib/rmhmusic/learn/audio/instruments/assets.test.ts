/**
 * The committed instrument samples match the generated zone map: every file exists, its SHA-256 is
 * the one the build wrote, sizes stay inside the byte budget, every note of each instrument's range
 * has a zone within its allowed shift, and every instrument has a credit. Budget: 0.6 MB per
 * instrument (the Phase 5 plan).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSTRUMENT_CATALOG, SAMPLE_DIR, zonesOf } from './catalog';
import { SOUND_CREDITS } from './credits';
import { INSTRUMENT_IDS } from './types';
import { coverage } from './zones';

const ROOT = join(__dirname, '../../../../..');
const dirOf = (id: string) => join(ROOT, 'public', SAMPLE_DIR, id);

describe('committed instrument samples', () => {
  let total = 0;
  for (const id of INSTRUMENT_IDS) {
    const meta = INSTRUMENT_CATALOG[id];
    const zones = zonesOf(id);

    it(`${id}: every zone's file is committed with the SHA-256 the build recorded`, () => {
      expect(zones.length).toBeGreaterThan(0);
      for (const z of zones) {
        const bytes = readFileSync(join(dirOf(id), z.file));
        expect(bytes.length, z.file).toBeGreaterThan(0);
        expect(bytes.length, z.file).toBeLessThanOrEqual(40 * 1024);
        expect(createHash('sha256').update(bytes).digest('hex'), z.file).toBe(z.sha256);
      }
    });

    it(`${id}: no stray files and the directory is at most 0.6 MB (600,000 bytes)`, () => {
      const files = readdirSync(dirOf(id)).sort();
      expect(files).toEqual(zones.map((z) => z.file).sort());
      const bytes = files.reduce((s, f) => s + statSync(join(dirOf(id), f)).size, 0);
      total += bytes;
      expect(bytes).toBeLessThanOrEqual(600_000);
    });

    it(`${id}: every note of its range is within ${meta.maxShift} semitone(s) of a zone`, () => {
      const loaded = new Set(zones.map((z) => z.file));
      expect(coverage(zones, loaded, meta.range, meta.maxShift)).toBe(true);
      for (const z of zones) {
        expect(z.keyCenter).toBeGreaterThanOrEqual(meta.range[0] - meta.maxShift);
        expect(z.keyCenter).toBeLessThanOrEqual(meta.range[1] + meta.maxShift);
        expect(Math.abs(z.tuneCents)).toBeLessThan(35);
      }
    });

    it(`${id}: has a credit`, () => {
      expect(SOUND_CREDITS[meta.credit]).toBeDefined();
    });
  }

  it('all ten together stay under 4 MB', () => {
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(4_000_000);
  });
});
