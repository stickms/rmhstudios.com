/**
 * The RMH Med Schools link-preview cards: the school card's route (`GET /api/og/med-school/$slug`, 404 for a slug that
 * is not an active school), what the card draws (facts only when the public page has them, never computed, never
 * "applicants"), its cache key, and the palette it restates from the app's stylesheet.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ogCardPath } from '@/lib/seo';
import { MED_CARD_VERSION } from '@/lib/og/static-card-index';

const h = vi.hoisted(() => ({
  card: null as unknown,
  render: vi.fn(async (_data: Record<string, unknown>) => Buffer.from('png')),
}));
vi.mock('@features/medschools/api/read.server', () => ({
  getCardData: vi.fn(async () => h.card),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

const real = await vi.importActual<typeof import('@/lib/og/med-card.server')>('@/lib/og/med-card.server');
vi.mock('@/lib/og/med-card.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/og/med-card.server')>()),
  renderMedSchoolCard: h.render,
}));

import { route } from '@/lib/og/api/og.med-school.$slug.server';

const { schoolCardModel, schoolCardKey, MED_PALETTE, MED_STATUS_COLORS, cardDay } = real;
type Input = Parameters<typeof schoolCardModel>[0];

const NOW = new Date('2026-11-25T12:00:00Z');

const get = (slug = 'duke') =>
  route.handlers.GET!({
    request: new Request(`https://rmhstudios.com/api/og/med-school/${slug}`, {
      headers: { 'cf-connecting-ip': `${Math.random()}` },
    }),
    params: { slug },
  });

const duke = (over: Partial<Input> = {}): Input => ({
  slug: 'duke',
  name: 'Duke University',
  degree: 'MD',
  city: 'Durham',
  state: 'NC',
  cycleYear: 2027,
  reported: { count: 120 },
  figures: [
    { kind: 'MCAT_MEDIAN', label: 'Median MCAT', value: '519', scope: null },
    { kind: 'GPA_MEAN', label: 'Mean GPA', value: '3.82', scope: null },
  ],
  latest: { eventType: 'INTERVIEW', occurredAt: '2026-11-24T15:42:00.000Z' },
  ...over,
});

beforeEach(() => h.render.mockClear());

describe('GET /api/og/med-school/$slug', () => {
  it('is named by ogCardPath with the med cards’ own version', () => {
    expect(ogCardPath('med-school', 'duke')).toBe(`/api/og/med-school/duke?v=${MED_CARD_VERSION}`);
  });

  it('is a 404 for an unknown or inactive slug and draws nothing', async () => {
    h.card = null;
    const res = await get('nope');
    expect(res.status).toBe(404);
    expect(h.render).not.toHaveBeenCalled();
  });

  it('is a long-cached PNG drawn from exactly what the loader returned', async () => {
    h.card = duke();
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=/);
    expect(h.render).toHaveBeenCalledWith(duke());
  });
});

describe('what the school card draws', () => {
  it('shows the class figures as stored (label and string), then the floored interview total, never "applicants"', () => {
    const m = schoolCardModel(duke(), NOW);
    expect(m.tiles.map((t) => [t.value, t.label, t.note])).toEqual([
      ['519', 'Median MCAT', null],
      ['3.82', 'Mean GPA', null],
      ['120', 'Reported interview invites', '2026–2027 cycle'],
    ]);
    expect(JSON.stringify(m)).not.toMatch(/applicant/i);
    expect(m.latest).toEqual({ status: 'interview', label: 'Interview invite', day: 'Nov 24' });
  });

  it('keeps a figure’s own scope under it and its value verbatim (never rounded or reformatted)', () => {
    const m = schoolCardModel(
      duke({ figures: [{ kind: 'MCAT_MEAN', label: 'Mean MCAT', value: '503.0', scope: 'five-year average' }] }),
      NOW,
    );
    expect(m.tiles[0]).toMatchObject({ value: '503.0', label: 'Mean MCAT', note: 'five-year average' });
  });

  it('omits what is absent: no figures, no count (or a zero), no latest event', () => {
    const m = schoolCardModel(duke({ figures: [], reported: null, latest: null }), NOW);
    expect(m.tiles).toEqual([]);
    expect(m.latest).toBeNull();
    expect(schoolCardModel(duke({ figures: [], reported: { count: 0 } }), NOW).tiles).toEqual([]);
  });

  it('draws at most three tiles', () => {
    const many = duke({
      figures: [
        { kind: 'MCAT_MEDIAN', label: 'Median MCAT', value: '519', scope: null },
        { kind: 'GPA_MEAN', label: 'Mean GPA', value: '3.82', scope: null },
        { kind: 'GPA_MEDIAN', label: 'Median GPA', value: '3.9', scope: null },
      ],
    });
    expect(schoolCardModel(many, NOW).tiles).toHaveLength(3);
  });

  it('prints a day in UTC, with the year only when it is not this year', () => {
    expect(cardDay('2026-11-24T23:30:00.000Z', NOW)).toBe('Nov 24');
    expect(cardDay('2025-06-02T00:00:00.000Z', NOW)).toBe('Jun 2, 2025');
  });
});

describe('the school card cache key', () => {
  it('changes when anything drawn changes, and only then', () => {
    const base = schoolCardKey(duke(), NOW);
    expect(schoolCardKey(duke(), NOW)).toBe(base);
    const variants = [
      duke({ reported: { count: 121 } }),
      duke({ reported: null }),
      duke({ figures: [{ kind: 'MCAT_MEDIAN', label: 'Median MCAT', value: '520', scope: null }] }),
      duke({ figures: [{ kind: 'MCAT_MEAN', label: 'Mean MCAT', value: '519', scope: null }] }),
      duke({ latest: { eventType: 'ACCEPTANCE', occurredAt: '2026-11-24T15:42:00.000Z' } }),
      duke({ latest: { eventType: 'INTERVIEW', occurredAt: '2026-11-25T01:00:00.000Z' } }),
      duke({ latest: null }),
      duke({ name: 'Duke University School of Medicine' }),
      duke({ cycleYear: 2028 }),
    ];
    const keys = variants.map((v) => schoolCardKey(v, NOW));
    for (const k of keys) expect(k).not.toBe(base);
    expect(new Set(keys).size).toBe(keys.length);
    // A new event on the same day with the same status draws the same card.
    expect(
      schoolCardKey(duke({ latest: { eventType: 'INTERVIEW', occurredAt: '2026-11-24T20:00:00.000Z' } }), NOW),
    ).toBe(base);
  });
});

describe('the palette restated from the app stylesheet', () => {
  const css = readFileSync(resolve(process.cwd(), 'features/medschools/ui/medschools/palette.css'), 'utf8');
  // The light block is the first one (`.app-theme.medapp-theme, :root:has(.medapp-theme) { … }`).
  const light = css.slice(0, css.indexOf('/* ── Dark'));
  const token = (name: string) => light.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toLowerCase();

  it('matches the light --app-* tokens', () => {
    expect(MED_PALETTE).toEqual({
      bg: token('app-bg'),
      surface: token('app-surface'),
      border: token('app-border'),
      text: token('app-text'),
      muted: token('app-text-muted'),
    });
  });

  it('matches every status trio', () => {
    for (const [stem, c] of Object.entries(MED_STATUS_COLORS)) {
      expect(c, stem).toEqual({
        swatch: token(`app-med-${stem}-swatch`),
        ink: token(`app-med-${stem}-ink`),
        text: token(`app-med-${stem}-text`),
      });
    }
  });
});

describe('rendering', () => {
  it('draws a 1200x630 PNG for a school with and without facts, and for the index and live cards', async () => {
    const pngs = await Promise.all([
      real.renderMedSchoolCard(duke(), NOW),
      real.renderMedSchoolCard(duke({ slug: 'no-crest', figures: [], reported: null, latest: null }), NOW),
      real.renderMedSectionCard({ kind: 'index', title: 'Med school cycles, reported daily.', subtitle: 'Sub.' }),
      real.renderMedSectionCard({ kind: 'live', title: 'Live reported events.', subtitle: 'Sub.' }),
    ]);
    for (const png of pngs) {
      const meta = await sharp(png).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
    }
  }, 30_000);
});
