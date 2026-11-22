/**
 * The data export (`GET /api/account/export`) carries the caller's own block and mute lists (s05-14): who, and since
 * when. A table missing from the export is personal data the person cannot see, hence a main-suite test.
 */
import { describe, expect, it, vi } from 'vitest';

const blockFind = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    {
      blockedId: 'b1',
      createdAt: new Date('2026-11-02T10:00:00Z'),
      blocked: {
        handle: 'ada',
      },
    },
  ]),
);
const muteFind = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => [
    {
      mutedId: 'm1',
      createdAt: new Date('2026-11-03T10:00:00Z'),
      muted: {
        handle: null,
      },
    },
  ]),
);

const emptyModel = new Proxy(
  {},
  {
    get: (_t, method: string) => vi.fn(async () => (method === 'findUnique' || method === 'findFirst' ? null : [])),
  },
);

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, model: string) =>
        model === 'userBlock'
          ? {
              findMany: blockFind,
            }
          : model === 'userMute'
            ? {
                findMany: muteFind,
              }
            : emptyModel,
    },
  ),
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: 'u1',
        },
        session: {
          id: 's1',
          userId: 'u1',
        },
      })),
    },
  },
}));
vi.mock('@/lib/rmhvibe/account-data.server', () => ({
  exportVibeData: vi.fn(async () => ({})),
}));
vi.mock('@/lib/rmhmusic/learn/account-data.server', () => ({
  exportMusicData: vi.fn(async () => ({})),
}));
vi.mock('@/lib/listings/listings.server', () => ({
  cardListingsForExport: vi.fn(async () => []),
}));

const { route } = await import('@/lib/account/api/account.export.server');

describe('account export: blocked and muted accounts', () => {
  it('lists only the caller’s own blocks and mutes', async () => {
    const request = new Request('https://rmhstudios.com/api/account/export', {
      headers: {
        cookie: 'better-auth.session_token=t',
        'x-forwarded-for': '203.0.113.11',
      },
    });
    const res = await route.handlers.GET!({
      request,
      params: {},
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      blocksMutes: unknown;
    };
    expect(blockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          blockerId: 'u1',
        },
      }),
    );
    expect(muteFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          muterId: 'u1',
        },
      }),
    );
    expect(body.blocksMutes).toEqual({
      blocked: [
        {
          userId: 'b1',
          handle: 'ada',
          since: '2026-11-02T10:00:00.000Z',
        },
      ],
      muted: [
        {
          userId: 'm1',
          handle: null,
          since: '2026-11-03T10:00:00.000Z',
        },
      ],
    });
  });
});
