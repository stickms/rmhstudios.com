import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultDayZero } from '../engine/cycle';
import { isCanadianLocation } from '../engine/names';
import { registryKeyOf, type CycleSeed, type RegistryFile, type RegistrySchool } from './registry';

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'data/medschools', name), 'utf8')) as T;

const file = read<RegistryFile>('schools.json');
const cycles = read<CycleSeed[]>('cycles.json');
const extras = read<{ schools: RegistrySchool[] }>('registry-extra.json').schools;

describe('data/medschools/schools.json', () => {
  it('holds only US MD/DO schools with a two-letter non-Canadian state', () => {
    for (const s of file.schools) {
      expect(['MD', 'DO'], s.slug).toContain(s.degree);
      expect(s.country, s.slug).toBe('US');
      expect(s.state, s.slug).toMatch(/^[A-Z]{2}$/);
      expect(isCanadianLocation(`${s.city}, ${s.state}`), s.slug).toBe(false);
    }
  });

  it('has unique slugs and unique (source, sourceKey) aliases', () => {
    const slugs = file.schools.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const keys = file.schools.flatMap((s) => s.aliases.map((a) => `${a.source}:${a.sourceKey}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps CycleTrack spellings verbatim and drops Canadian schools', () => {
    const keys = new Set(file.schools.flatMap((s) => s.aliases.map((a) => a.sourceKey)));
    for (const k of ['Yale', 'Texas A&M', 'Massachussetts']) expect(keys.has(k), k).toBe(true);
    for (const k of ['Toronto', 'Alberta']) expect(keys.has(k), k).toBe(false);
  });

  it('no school slug collides with a static /med route', () => {
    // `/med/$slug` is a param route; `live` is a page now and `tracker`, `lists`, `ask` are coming.
    const reserved = new Set(['tracker', 'lists', 'live', 'ask']);
    expect(file.schools.filter((s) => reserved.has(s.slug)).map((s) => s.slug)).toEqual([]);
  });

  it('carries every hand-maintained extra verbatim, with no CycleTrack alias', () => {
    const bySlug = new Map(file.schools.map((s) => [s.slug, s]));
    for (const x of extras) {
      expect(bySlug.get(x.slug), x.slug).toEqual(x);
      expect(
        x.aliases.filter((a) => a.source === 'CYCLETRACK'),
        x.slug,
      ).toEqual([]);
      expect(x.website ?? '', x.slug).toMatch(/^https:\/\//);
    }
  });

  it('gives every school a distinct registry key (the name the alias files use)', () => {
    const keys = file.schools.map(registryKeyOf);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('is the expected size', () => {
    expect(file.schools.length).toBeGreaterThanOrEqual(180);
    expect(file.schools.length).toBeLessThanOrEqual(238);
  });
});

describe('data/medschools/cycles.json', () => {
  it('covers 2025 through 2027 and uses the default day zero when estimated', () => {
    for (const y of [2025, 2026, 2027])
      expect(
        cycles.some((c) => c.cycleYear === y),
        String(y),
      ).toBe(true);
    for (const c of cycles.filter((x) => x.dateEstimated)) {
      expect(c.dayZeroOn, String(c.cycleYear)).toBe(defaultDayZero(c.cycleYear));
    }
  });
});
