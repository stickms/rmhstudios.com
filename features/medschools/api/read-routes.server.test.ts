import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(async () => null),
  listSchools: vi.fn(),
  getSchool: vi.fn(),
  getActivity: vi.fn(),
  getHistory: vi.fn(),
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
  getLive: mocks.getLive,
  getToday: mocks.getToday,
}));

import { route as schools } from './medschools.schools.server';
import { route as school } from './medschools.schools.$slug.server';
import { route as activity } from './medschools.schools.$slug.activity.server';
import { route as history } from './medschools.schools.$slug.history.server';
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
  ['live', live, mocks.getLive, false],
  ['today', today, mocks.getToday, false],
];

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(cc).toContain(name === 'live' ? 's-maxage=15' : 's-maxage=60');
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
