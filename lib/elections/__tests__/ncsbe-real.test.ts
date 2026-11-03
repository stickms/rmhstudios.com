/**
 * Opt-in: validates the NC State Board of Elections adapter against the REAL published files (primaries
 * and a general). Skipped unless ELECTIONS_REAL_DATA_DIR points at a directory holding the extracted
 * results, so the normal suite stays offline and fast:
 *
 *   mkdir -p $D/p26 $D/p24 $D/g24
 *   curl -sO https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/2026_03_03/results_pct_20260303.zip && unzip -d $D/p26 …
 *   ELECTIONS_REAL_DATA_DIR=$D pnpm exec vitest run lib/elections/__tests__/ncsbe-real.test.ts
 *
 * (p26 = 2026-03-03 primary, p24 = 2024-03-05 primary, g24 = 2024-11-05 general.)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalizeRaces, parseNcsbeResults } from '../sources/ncsbe';

const DIR = process.env.ELECTIONS_REAL_DATA_DIR;
const load = (sub: string) => {
  const d = join(DIR!, sub);
  const f = readdirSync(d).find((n) => n.endsWith('.txt'))!;
  return readFileSync(join(d, f), 'utf8');
};
const run = DIR && existsSync(DIR) ? describe : describe.skip;

run('NC SBE adapter against real published files', () => {
  it('2026-03-03 primary: federal primaries for both parties, sane counts', () => {
    const { races, rows } = parseNcsbeResults(load('p26'), '2026-03-03');
    expect(rows).toBeGreaterThan(50_000);
    const sen = races.filter((r) => r.office === 'senate');
    expect(sen.map((r) => r.primaryParty).sort()).toEqual(['DEM', 'GOP']);
    for (const r of sen) {
      expect(r.type).toBe('Primary');
      expect(r.totalVotes).toBeGreaterThan(100_000);
      expect(r.candidates[0].votes).toBeGreaterThanOrEqual(r.candidates[1].votes);
      expect(r.candidates.reduce((s, c) => s + c.pct, 0)).toBeGreaterThan(99);
      expect(r.candidates.reduce((s, c) => s + c.pct, 0)).toBeLessThan(101);
      expect(r.pctReporting).toBeGreaterThan(90);
    }
    // 14 congressional districts, each with at least one party primary.
    const houseDistricts = new Set(races.filter((r) => r.office === 'house').map((r) => r.district));
    expect(houseDistricts.size).toBeGreaterThanOrEqual(10);
    // State legislative/judicial/local contests are NOT carried, and the state "NC HOUSE" is not US House.
    expect(races.every((r) => ['senate', 'house', 'governor', 'president'].includes(r.office))).toBe(true);
  });

  it('2026 primary: a FINAL count calls leaders by rule; mid-count calls nothing', () => {
    const { races } = parseNcsbeResults(load('p26'), '2026-03-03');
    expect(finalizeRaces(races, false).some((r) => r.status === 'called')).toBe(false);
    const fin = finalizeRaces(races, true);
    const called = fin.filter((r) => r.status === 'called');
    expect(called.length).toBeGreaterThan(0);
    for (const r of called) {
      expect(r.calledBy).toEqual(['ncsbe-final']);
      expect(r.candidates.filter((c) => c.won)).toHaveLength(1);
      expect(r.candidates[0].won).toBe(true);
      // a primary leader needs >30% to avoid a runoff
      expect(r.candidates[0].pct).toBeGreaterThan(30);
    }
    // anything NOT called in a primary must be a race with no >30% leader or a tie
    for (const r of fin.filter((x) => x.status !== 'called' && x.totalVotes > 0)) {
      expect(r.candidates[0].pct <= 30 || r.candidates[0].votes === r.candidates[1]?.votes).toBe(true);
    }
  });

  it('2024-03-05 primary: presidential preference + governor, per party', () => {
    const { races } = parseNcsbeResults(load('p24'), '2024-03-05');
    const pres = races.filter((r) => r.office === 'president');
    expect(pres.length).toBeGreaterThanOrEqual(2);
    expect(pres.every((r) => r.primaryParty !== null)).toBe(true);
    const gov = races.filter((r) => r.office === 'governor');
    expect(gov.length).toBeGreaterThanOrEqual(2);
    // Presidential preference is plurality — finalised even under 30%? the leader there is far above 30 anyway.
    for (const r of finalizeRaces(pres, true)) expect(r.status).toBe('called');
  });

  it('2024-11-05 general: president, governor, senate-less year, 14 US House seats', () => {
    const { races } = parseNcsbeResults(load('g24'), '2024-11-05');
    const pres = races.find((r) => r.office === 'president')!;
    expect(pres.type).toBe('General');
    expect(pres.primaryParty).toBeNull();
    expect(pres.totalVotes).toBeGreaterThan(5_000_000);
    // Known result: North Carolina cast ~5.7M presidential votes in 2024; Trump won the state.
    expect(pres.candidates[0].lastName).toBe('Trump');
    expect(pres.candidates[0].party).toBe('GOP');
    expect(pres.candidates[1].lastName).toBe('Harris');
    const gov = races.find((r) => r.office === 'governor')!;
    expect(gov.candidates[0].lastName).toBe('Stein');
    expect(races.filter((r) => r.office === 'house')).toHaveLength(14);
    expect(races.filter((r) => r.office === 'senate')).toHaveLength(0);
  });
});
