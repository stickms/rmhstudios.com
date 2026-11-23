import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { clearResponseCache } from '@/lib/api/response-cache.server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(async () => null),
  listSchools: vi.fn(),
  getSchool: vi.fn(),
  getActivity: vi.fn(),
  getHistory: vi.fn(),
  getForecast: vi.fn(),
  getLive: vi.fn(),
  getToday: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('./read.server', () => ({
  listSchools: mocks.listSchools,
  getSchool: mocks.getSchool,
  getActivity: mocks.getActivity,
  getHistory: mocks.getHistory,
  getForecast: mocks.getForecast,
  getLive: mocks.getLive,
  getToday: mocks.getToday,
}));

import { route as schools } from './medschools.schools.server';
import { route as school } from './medschools.schools.$slug.server';
import { route as activity } from './medschools.schools.$slug.activity.server';
import { route as history } from './medschools.schools.$slug.history.server';
import { route as forecast } from './medschools.schools.$slug.forecast.server';
import { route as live } from './medschools.live.server';
import { route as today } from './medschools.today.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const get = (route: unknown, query = '', params: Record<string, string> = {}) =>
  handlersOf<Handler>(route).GET!({ params, request: new Request(`https://rmhstudios.com/api/medschools/x${query}`) });

const cases: Array<[string, unknown, ReturnType<typeof vi.fn>, boolean]> = [
  ['schools', schools, mocks.listSchools, false],
  ['school', school, mocks.getSchool, true],
  ['activity', activity, mocks.getActivity, true],
  ['history', history, mocks.getHistory, true],
  ['forecast', forecast, mocks.getForecast, true],
  ['live', live, mocks.getLive, false],
  ['today', today, mocks.getToday, false],
];

beforeEach(() => {
  vi.clearAllMocks();
  clearResponseCache(); // public GETs are micro-cached by URL; each case must reach its loader
  for (const [, , fn] of cases) fn.mockResolvedValue({ ok: true });
});

describe('public med school reads', () => {
  it.each(cases)('%s answers anonymously with the loader body and a public cache', async (name, route, loader) => {
    const res = await get(route, '', { slug: 'duke' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(loader).toHaveBeenCalled();
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toContain('public');
    expect(cc).toContain(name === 'live' ? 's-maxage=15' : name === 'forecast' ? 's-maxage=600' : 's-maxage=60');
    if (name === 'forecast') {
      expect(cc).toBe('public, max-age=300, s-maxage=600, stale-while-revalidate=1800');
    }
  });

  it.each(cases.filter((c) => c[3]))('%s is a 404 JSON when the loader returns null', async (_n, route, loader) => {
    loader.mockResolvedValue(null);
    const res = await get(route, '', { slug: 'nope' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it.each(['%00', 'DUKE', 'x'.repeat(300)])(
    'passes slug %j to the loader unchanged; null is 404 not 500',
    async (slug) => {
      mocks.getSchool.mockResolvedValue(null);
      const res = await get(school, '', { slug });
      expect(mocks.getSchool).toHaveBeenCalledWith(slug);
      expect(res.status).toBe(404);
    },
  );

  it.each([
    ['schools', schools, '?degree=PhD'],
    ['schools', schools, '?state=zz9'],
    ['schools', schools, `?q=${'a'.repeat(10_000)}`],
    ['schools', schools, '?program=NONE'],
    ['live', live, '?school=%2500'],
    ['live', live, '?school=DUKE'],
    ['live', live, `?school=${'a'.repeat(81)}`],
    ['live', live, '?limit=-1'],
    ['live', live, '?limit=1000'],
    ['live', live, '?cursor=%25%25%25'],
    ['today', today, '?program=NONE'],
    ['activity', activity, '?program=NONE'],
    ['history', history, '?type=HOLD'],
    ['forecast', forecast, '?type=BOGUS'],
    ['forecast', forecast, '?program=NONE'],
  ])('%s rejects %s with 400', async (_n, route, query) => {
    const res = await get(route, query, { slug: 'duke' });
    expect(res.status).toBe(400);
  });

  it('accepts the O5 program values and a degree', async () => {
    expect((await get(live, '?program=NONE&degree=DO')).status).toBe(200);
    expect(mocks.getLive.mock.calls[0]![0]).toEqual({ program: 'NONE', degree: 'DO' });
    expect((await get(schools, '?program=ALL&degree=MD&state=NC&q=duke')).status).toBe(200);
  });

  it('a throwing loader gives a bare 500', async () => {
    mocks.getToday.mockRejectedValue(new Error('secret db detail'));
    const res = await get(today);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('the forecast route', () => {
  it('answers two different sessions with the same bytes', async () => {
    mocks.getForecast.mockResolvedValue({ status: 'ready' });
    const a = await get(forecast, '?program=REG', { slug: 'duke' });
    mocks.session.mockResolvedValueOnce({ user: { id: 'u1' } } as never);
    clearResponseCache();
    const b = await get(forecast, '?program=REG', { slug: 'duke' });
    expect(await b.text()).toBe(await a.text());
    expect(mocks.getForecast.mock.calls.every((c) => c.length === 2)).toBe(true);
  });
});
