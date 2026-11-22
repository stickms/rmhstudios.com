import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mocks.session,
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    medSchoolAliasMiss: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      update: vi.fn(),
    },
    medSchool: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
    medSchoolAlias: {
      findMany: vi.fn(async () => []),
    },
  },
}));

import { route as listRoute } from './admin.medschools.alias-misses.server';
import { route as mapRoute } from './admin.medschools.alias-misses.map.server';
import { route as ignoreRoute } from './admin.medschools.alias-misses.ignore.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (route: unknown, method: string, body?: unknown) =>
  handlersOf<Handler>(route)[method]!({
    params: {},
    request: new Request('https://rmhstudios.com/api/admin/medschools/alias-misses', {
      method,
      headers: {
        cookie: 'better-auth.session_token=abc',
        'content-type': 'application/json',
      },
      ...(body === undefined
        ? {}
        : {
            body: typeof body === 'string' ? body : JSON.stringify(body),
          }),
    }),
  });

const cases: Array<[string, unknown, string, unknown]> = [
  ['list', listRoute, 'GET', undefined],
  [
    'map',
    mapRoute,
    'POST',
    {
      missId: 'm',
      schoolId: 's',
    },
  ],
  [
    'ignore',
    ignoreRoute,
    'POST',
    {
      missId: 'm',
    },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: {
      id: 'admin',
      isAdmin: true,
    },
  });
  mocks.findMany.mockResolvedValue([]);
  mocks.findFirst.mockResolvedValue(null);
});

describe.each(cases)('%s route', (_name, route, method, body) => {
  it('anonymous is 401', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call(route, method, body)).status).toBe(401);
  });
  it('non-admin is 403', async () => {
    mocks.session.mockResolvedValue({
      user: {
        id: 'u',
        isAdmin: false,
      },
    });
    expect((await call(route, method, body)).status).toBe(403);
  });
});

describe('write validation and passthrough', () => {
  it.each([
    [
      'map',
      mapRoute,
      {
        missId: 'm',
      },
    ],
    ['ignore', ignoreRoute, {}],
  ])('%s: a malformed body is 400', async (_n, route, bad) => {
    expect((await call(route, 'POST', bad)).status).toBe(400);
    expect((await call(route, 'POST', '{not json')).status).toBe(400);
  });
  it('admin list is 200', async () => {
    const res = await call(listRoute, 'GET');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      misses: [],
      schools: [],
    });
  });
  it('ignore of an unknown miss is 404', async () => {
    expect(
      (
        await call(ignoreRoute, 'POST', {
          missId: 'x',
        })
      ).status,
    ).toBe(404);
  });
});
