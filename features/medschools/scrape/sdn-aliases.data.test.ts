import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SdnOverride } from '../engine/sdn-match';
import { parseSummaryKey, summaryKey } from '../engine/sdn-title';
import { registryKeyOf, type RegistryFile, type SdnAliasFile } from './registry';

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'data/medschools', name), 'utf8')) as T;

const file = read<SdnAliasFile>('sdn-aliases.json');
const schools = read<RegistryFile>('schools.json').schools;
const overrides = read<Record<string, SdnOverride>>('sdn-overrides.json');
/** CycleTrack keys, plus the shortName of each registry extra CycleTrack does not list. */
const registryKeys = new Set(schools.map(registryKeyOf));

/**
 * Schools allowed to have no SDN thread stem: no current-cycle thread exists for them on SDN (Drew/UCLA shares the
 * Drew thread; CUNY and the two campuses that opened in 2026, LECOM Jacksonville and LMU-DCOM Orange Park, have a
 * summary page only). This list may only shrink, except by a school that joins the registry without a thread.
 */
const NO_THREAD_ALLOWED = [
  'Charles R. Drew-UCLA',
  'City University of New York',
  'Lake Erie - Jacksonville',
  'Lincoln Memorial - Orange Park',
];

describe('sdn-aliases.json', () => {
  it('every cycletrackKey exists in schools.json', () => {
    expect(file.aliases.map((a) => a.cycletrackKey).filter((k) => !registryKeys.has(k))).toEqual([]);
  });

  it('lists each cycletrackKey once', () => {
    const keys = file.aliases.map((a) => a.cycletrackKey);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('no stem or summary key appears under two schools', () => {
    const owners = new Map<string, string>();
    const clash: string[] = [];
    for (const a of file.aliases) {
      const keys = [...a.threadStems, ...(a.summary ? [summaryKey(a.summary.code, a.summary.slug)] : [])];
      for (const k of keys) {
        const prior = owners.get(k);
        if (prior !== undefined && prior !== a.cycletrackKey) clash.push(k);
        owners.set(k, a.cycletrackKey);
      }
    }
    expect(clash).toEqual([]);
  });

  it('every summary has a code and a slug that survive the key round-trip', () => {
    for (const a of file.aliases)
      if (a.summary) expect(parseSummaryKey(summaryKey(a.summary.code, a.summary.slug))).toEqual(a.summary);
  });

  it('every school has a thread stem or is on the explicit allowed list', () => {
    const withStem = new Set(file.aliases.filter((a) => a.threadStems.length > 0).map((a) => a.cycletrackKey));
    const without = [...registryKeys].filter((k) => !withStem.has(k)).sort();
    expect(without).toEqual([...NO_THREAD_ALLOWED].sort());
  });

  it('ignoredStems are exactly the ignore overrides, and no stem is both ignored and mapped', () => {
    const ignores = Object.entries(overrides)
      .filter(([, v]) => 'ignore' in v)
      .map(([k]) => k)
      .sort();
    expect([...(file.ignoredStems ?? [])].sort()).toEqual(ignores);
    const mapped = new Set(file.aliases.flatMap((a) => a.threadStems));
    expect(ignores.filter((k) => mapped.has(k))).toEqual([]);
  });

  it('every override targets an existing registry key', () => {
    expect(Object.values(overrides).filter((v) => 'cycletrackKey' in v && !registryKeys.has(v.cycletrackKey))).toEqual(
      [],
    );
  });
});
