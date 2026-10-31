/**
 * The CI shard plan of the match project (testing/balatro-e2e/shards.ts) covers every match
 * file exactly once, and the workflow's matrix runs exactly those shards — so a new or renamed
 * match file can never fall out of CI unnoticed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MATCH_DIR, MATCH_SHARDS, shardFiles } from '../shards';
import { REPO_ROOT } from './static-server';
import { DEFAULT_TURBO, turboOn, turboSetting } from './turbo';

const WORKFLOW = path.join(REPO_ROOT, '.github/workflows/balatro-mp-tests.yml');

describe('match shards', () => {
  it('put every match test file in exactly one shard', () => {
    const onDisk = readdirSync(path.join(REPO_ROOT, MATCH_DIR))
      .filter((f) => f.endsWith('.test.ts') && !f.endsWith('.unit.test.ts'))
      .sort();
    const assigned = Object.values(MATCH_SHARDS).flat();
    expect([...assigned].sort()).toEqual(onDisk);
    expect(new Set(assigned).size).toBe(assigned.length);
    for (const name of Object.keys(MATCH_SHARDS))
      expect(MATCH_SHARDS[name]!.length).toBeGreaterThan(0);
  });

  it('match the e2e-match matrix in the workflow', () => {
    const yml = readFileSync(WORKFLOW, 'utf8');
    const job = yml.slice(yml.indexOf('\n  e2e-match:'));
    const m = /\n\s+shard:\s*\[([^\]]+)\]/.exec(job);
    expect(m, 'e2e-match: strategy.matrix.shard: [...]').not.toBeNull();
    const matrix = m![1]!.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    expect([...matrix].sort()).toEqual(Object.keys(MATCH_SHARDS).sort());
  });

  it('resolve a shard to repo-relative paths and refuse an unknown one', () => {
    expect(shardFiles('migration')).toEqual([
      'testing/balatro-e2e/match/host-migration.test.ts',
      'testing/balatro-e2e/match/large.test.ts',
    ]);
    expect(() => shardFiles('nope')).toThrow(/unknown match shard nope/);
  });
});

describe('turbo setting', () => {
  it('defaults to 8 updates and a draw every 4th frame', () => {
    expect(turboSetting({})).toEqual(DEFAULT_TURBO);
    expect(DEFAULT_TURBO).toEqual([8, 4]);
    expect(turboSetting({ BALATRO_E2E_TURBO: 'garbage' })).toEqual(DEFAULT_TURBO);
  });
  it('parses UxD, clamps to 1..64, and turns off', () => {
    expect(turboSetting({ BALATRO_E2E_TURBO: '16x2' })).toEqual([16, 2]);
    expect(turboSetting({ BALATRO_E2E_TURBO: '99x0' })).toEqual([64, 1]);
    for (const off of ['off', 'OFF', '0', 'false', '1x1']) {
      expect(turboOn(turboSetting({ BALATRO_E2E_TURBO: off }))).toBe(false);
    }
    expect(turboOn(turboSetting({}))).toBe(true);
  });
});
