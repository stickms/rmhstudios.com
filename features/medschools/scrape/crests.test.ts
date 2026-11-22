import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { PoliteClient, PoliteResult } from './http';
import { CREST_SIZE, fetchCrest, isHttps, planCrests, toCrestWebp } from './crests';
import type { RegistrySchool } from './registry';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="300" height="120" fill="#123"/></svg>';

const school = (slug: string, key: string): RegistrySchool => ({
  slug,
  name: slug,
  shortName: key,
  degree: 'MD',
  city: 'X',
  state: 'MA',
  country: 'US',
  website: null,
  aliases: [{ source: 'CYCLETRACK', sourceKey: key }],
});
const admit = (slug: string, crestUrl: string | null) => ({ slug, name: slug, shortName: '', city: '', state: '', crestUrl });

const clientFor = (res: Partial<PoliteResult>): PoliteClient =>
  ({
    get: async () => ({ ok: true, status: 200, body: SVG, contentType: 'image/svg+xml', ...res }),
  }) as unknown as PoliteClient;

describe('planCrests', () => {
  const registry = [school('harvard', 'Harvard'), school('duke', 'Duke'), school('yale', 'Yale')];
  const aliases = [
    { cycletrackKey: 'Harvard', admitSlug: 'harvard-medical-school' },
    { cycletrackKey: 'Duke', admitSlug: 'duke-school' },
    { cycletrackKey: 'Yale', admitSlug: 'yale-school' },
  ];
  it('maps matched schools, lists unmatched, skips ignored, no crest and non-https', () => {
    const plan = planCrests({
      admit: [
        admit('harvard-medical-school', 'https://x.example/h.svg'),
        admit('duke-school', null),
        admit('yale-school', 'http://x.example/y.svg'),
        admit('mystery', 'https://x.example/m.svg'),
        admit('extra-campus', 'https://x.example/e.svg'),
      ],
      registry,
      aliases,
      ignoredSlugs: ['extra-campus'],
    });
    expect(plan.jobs).toEqual([{ slug: 'harvard', admitSlug: 'harvard-medical-school', url: 'https://x.example/h.svg' }]);
    expect(plan.noCrest).toEqual(['duke']);
    expect(plan.badUrl).toEqual(['yale']);
    expect(plan.unmatched).toEqual(['mystery']);
  });
});

describe('crest conversion', () => {
  it('makes a 96x96 transparent WebP without metadata', async () => {
    const webp = await toCrestWebp(Buffer.from(SVG));
    const meta = await sharp(webp).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['webp', CREST_SIZE, CREST_SIZE, true]);
    expect(meta.exif).toBeUndefined();
    expect(webp.length).toBeLessThan(6 * 1024);
  });

  it('accepts only https', () => {
    expect(isHttps('https://a.example/x.svg')).toBe(true);
    expect(isHttps('http://a.example/x.svg')).toBe(false);
    expect(isHttps('nope')).toBe(false);
  });

  it('fetchCrest converts an svg and rejects other content types, big bodies and failures', async () => {
    expect((await fetchCrest(clientFor({}), 'https://a.example/c.svg')).ok).toBe(true);
    expect(await fetchCrest(clientFor({ contentType: 'text/html' }), 'https://a.example/c.svg')).toMatchObject({ ok: false });
    expect(await fetchCrest(clientFor({ body: 'x'.repeat(2 * 1024 * 1024 + 1) }), 'https://a.example/c.svg')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('too large'),
    });
    expect(await fetchCrest(clientFor({ ok: false, status: 404 }), 'https://a.example/c.svg')).toMatchObject({ ok: false });
    expect(await fetchCrest(clientFor({}), 'http://a.example/c.svg')).toMatchObject({ ok: false });
  });
});
