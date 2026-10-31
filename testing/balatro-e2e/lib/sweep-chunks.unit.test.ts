/**
 * The full UI sweep's chunks (ui_sweep_full.lua CHUNKS, run by engine/sweep.ts) cover every test
 * of the sweep exactly once, and the nightly workflow job runs the driver — so a new sweep test
 * cannot fall out of the nightly run unnoticed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chunkFilter,
  parseSweepChunks,
  SWEEP_PATH,
  sweepChunks,
  sweepTestNames,
} from './sweep-chunks';
import { REPO_ROOT } from './static-server';

/** Tests that are no chunk's: the whole-file summary. */
const UNCHUNKED = ['summary: counts, buttons and every error seen'];

describe('ui sweep chunks', () => {
  it('put every sweep test in exactly one chunk, with unique ids', () => {
    const chunks = sweepChunks();
    expect(chunks.length).toBeGreaterThan(5);
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of chunks) expect(c.tests.length, c.id).toBeGreaterThan(0);
    const assigned = chunks.flatMap((c) => c.tests);
    expect(new Set(assigned).size).toBe(assigned.length);
    const names = sweepTestNames(readFileSync(SWEEP_PATH, 'utf8')).filter(
      (n) => !UNCHUNKED.includes(n),
    );
    expect([...assigned].sort()).toEqual([...names].sort());
  });

  it('give each chunk a filter no other test name matches by accident', () => {
    const chunks = sweepChunks();
    for (const a of chunks)
      for (const b of chunks)
        if (a !== b) expect(chunkFilter(b.id).includes(chunkFilter(a.id))).toBe(false);
  });

  it('parse the CHUNKS block, quotes included, and refuse a file without one', () => {
    const src = `x\n-- CHUNKS BEGIN\nlocal CHUNKS = {\n  { id = 'a', tests = { 'one', 'it\\'s two' } },\n  { id = 'b', tests = { 'three' } },\n}\n-- CHUNKS END\n`;
    expect(parseSweepChunks(src)).toEqual([
      { id: 'a', tests: ['one', "it's two"] },
      { id: 'b', tests: ['three'] },
    ]);
    expect(() => parseSweepChunks('local CHUNKS = {}')).toThrow(/CHUNKS BEGIN/);
  });

  it('are run by a nightly/long-only workflow job', () => {
    const yml = readFileSync(
      path.join(REPO_ROOT, '.github/workflows/balatro-mp-tests.yml'),
      'utf8',
    );
    const start = yml.indexOf('\n  e2e-sweep:');
    expect(start, 'job e2e-sweep').toBeGreaterThan(0);
    const job = yml.slice(
      start,
      yml.indexOf('\n  e2e-match:', start) > 0 ? yml.indexOf('\n  e2e-match:', start) : undefined,
    );
    expect(job).toContain("github.event_name == 'schedule' || inputs.long == true");
    expect(job).toContain('testing/balatro-e2e/engine/sweep.ts');
  });
});
