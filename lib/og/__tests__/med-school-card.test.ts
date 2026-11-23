/**
 * The per-school link-preview card (`GET /api/og/med-school/$slug`): drawn through `renderPageCard`, 404 for a slug
 * that is not an active school, stats only from the loader's (already floored) figure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ogCardPath, OG_CARD_VERSION } from '@/lib/seo';

const h = vi.hoisted(() => ({
  card: null as unknown,
  render: vi.fn(async (_data: Record<string, unknown>) => Buffer.from('png')),
}));
vi.mock('@features/medschools/api/read.server', () => ({
  getCardData: vi.fn(async () => h.card),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/og/page-card.server', () => ({ renderPageCard: h.render }));

import { route } from '@/lib/og/api/og.med-school.$slug.server';

const get = (slug = 'duke') =>
  route.handlers.GET!({
    request: new Request(`https://rmhstudios.com/api/og/med-school/${slug}`, {
      headers: { 'cf-connecting-ip': `${Math.random()}` },
    }),
    params: { slug },
  });

const duke = (reported: { source: string; count: number } | null) => ({
  name: 'Duke University School of Medicine',
  degree: 'MD',
  city: 'Durham',
  state: 'NC',
  cycleYear: 2027,
  reported,
});

beforeEach(() => h.render.mockClear());

describe('GET /api/og/med-school/$slug', () => {
  it('is named by ogCardPath with the card version', () => {
    expect(ogCardPath('med-school', 'duke')).toBe(`/api/og/med-school/duke?v=${OG_CARD_VERSION}`);
  });

  it('is a 404 for an unknown or inactive slug and draws nothing', async () => {
    h.card = null;
    const res = await get('nope');
    expect(res.status).toBe(404);
    expect(h.render).not.toHaveBeenCalled();
  });

  it('is a long-cached PNG for a known school, drawn from its name, degree and place', async () => {
    h.card = duke({ source: 'CYCLETRACK', count: 120 });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=/);
    const data = h.render.mock.calls[0]![0];
    expect(data).toMatchObject({
      eyebrow: 'RMH Med Schools',
      title: 'Duke University School of Medicine',
      subtitle: 'MD · Durham, NC',
      path: '/rmh-medschool/duke',
      stats: [{ value: '120', label: 'reported interview events, 2026\u20132027 cycle', lead: true }],
    });
  });

  it('draws no figure when the loader reports none (nothing suppressed or program-less leaks in)', async () => {
    h.card = duke(null);
    await get();
    const data = h.render.mock.calls[0]![0];
    expect(data.stats).toBeUndefined();
    expect(data.cacheKey).toBe('med-school:duke:2027:none');
  });

  it('keys the cache on the count', async () => {
    h.card = duke({ source: 'ADMIT', count: 5 });
    await get();
    h.card = duke({ source: 'ADMIT', count: 6 });
    await get();
    const keys = h.render.mock.calls.map((c) => c[0].cacheKey);
    expect(keys).toEqual(['med-school:duke:2027:5', 'med-school:duke:2027:6']);
  });
});
