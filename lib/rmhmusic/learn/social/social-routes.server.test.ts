/**
 * What the two Phase 6 read endpoints actually send. `implement()` checks a `response` schema only
 * outside production and sends the handler's own object, so a schema there filters nothing; these
 * handlers send `schema.parse(result)` themselves, and this file holds that anything the server
 * code lets slip (an id, a handle, an e-mail) never reaches the response, in any NODE_ENV.
 *
 * 1. `GET /api/rmhmusic/friends`: only the names in `friendsRes`, at every level.
 * 2. `GET /api/rmhmusic/r/$token`: only the names in `sharedResultRes`; the share `id` (what
 *    Report names) goes to a signed-in viewer only, and `mine` says whether that viewer made it.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const h =
  vi.hoisted(
    () => ({
      getSession:
        vi.fn(),
      loadFriendsProgress:
        vi.fn(),
      getSharedResult:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          h.getSession,
      },
    },
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);
vi.mock(
  '@/lib/rmhmusic/learn/social/friends.server',
  () => ({
    loadFriendsProgress:
      h.loadFriendsProgress,
  }),
);
vi.mock(
  '@/lib/rmhmusic/learn/social/share.server',
  () => ({
    getSharedResult:
      h.getSharedResult,
  }),
);

import { route as friendsRoute } from '@/lib/rmhmusic/api/rmhmusic.friends.server';
import { route as sharedRoute } from '@/lib/rmhmusic/api/rmhmusic.r.$token.server';

const TOKEN =
  'AbCdEfGhIjKlMnOpQrSt_-';

function req(
  path: string,
  signedIn: boolean,
): Request {
  return new Request(
    `https://rmhstudios.com${path}`,
    {
      headers:
        {
          ...(signedIn
            ? {
                cookie:
                  'better-auth.session_token=abc',
              }
            : {}),
          'cf-connecting-ip': `${Math.random()}`,
        },
    },
  );
}

async function getFriends() {
  const res =
    await handlersOf(
      friendsRoute,
    )
      .GET!(
      {
        request:
          req(
            '/api/rmhmusic/friends?limit=100',
            true,
          ),
        params:
          {},
      },
    );
  expect(
    res.status,
  ).toBe(
    200,
  );
  return res.json();
}

async function getShared(
  signedIn: boolean,
) {
  const res =
    await handlersOf(
      sharedRoute,
    )
      .GET!(
      {
        request:
          req(
            `/api/rmhmusic/r/${TOKEN}`,
            signedIn,
          ),
        params:
          {
            token:
              TOKEN,
          },
      },
    );
  expect(
    res.status,
  ).toBe(
    200,
  );
  return res.json();
}

const daily =
  {
    v: 1,
    kind: 'daily',
    date: '2026-11-15',
    score: 92,
    stars: 2,
    right: 28,
    played: 30,
    skipped: 0,
    avgMs: 912,
  };

beforeEach(
  () => {
    h.getSession.mockReset();
    h.getSession.mockResolvedValue(
      {
        user: {
          id: 'viewer',
          name: 'V',
        },
      },
    );
    h.loadFriendsProgress.mockReset();
    h.getSharedResult.mockReset();
  },
);

describe('GET /api/rmhmusic/friends', () => {
  it('sends only the fields friendsRes names, whatever the server code returned', async () => {
    h.loadFriendsProgress.mockResolvedValue(
      {
        optedIn: true,
        total: 1,
        userId:
          'viewer',
        friends:
          [
            {
              id: 'u2',
              userId:
                'u2',
              user: {
                id: 'u2',
                name: 'Ben',
                image:
                  null,
                handle:
                  'ben',
                email:
                  'ben@example.com',
              },
              daily:
                {
                  streak: 3,
                  today: true,
                  userId:
                    'u2',
                },
              units:
                {
                  finished: 4,
                  total: 40,
                  last: 'Unit 4',
                  instrument:
                    'guitar',
                },
              songs:
                [
                  {
                    songId:
                      'ode',
                    title:
                      'Ode to Joy',
                    composer:
                      'Beethoven',
                    mode: 'wait',
                    bestScore: 900,
                    latencyMs: 40,
                    input:
                      'mic',
                  },
                ],
              email:
                'ben@example.com',
            },
          ],
      },
    );
    const body =
      await getFriends();
    expect(
      body,
    ).toEqual(
      {
        optedIn: true,
        total: 1,
        friends:
          [
            {
              user: {
                name: 'Ben',
                image:
                  null,
              },
              daily:
                {
                  streak: 3,
                  today: true,
                },
              units:
                {
                  finished: 4,
                  total: 40,
                  last: 'Unit 4',
                },
              songs:
                [
                  {
                    songId:
                      'ode',
                    title:
                      'Ode to Joy',
                    composer:
                      'Beethoven',
                    mode: 'wait',
                    bestScore: 900,
                  },
                ],
            },
          ],
      },
    );
    const text =
      JSON.stringify(
        body,
      );
    for (const leak of [
      'u2',
      'ben@example.com',
      '"ben"',
      'guitar',
      'latencyMs',
      'mic',
    ]) {
      expect(
        text,
      ).not.toContain(
        leak,
      );
    }
  });
});

describe('GET /api/rmhmusic/r/$token', () => {
  const live =
    {
      state:
        'live',
      id: 'share1',
      mine: false,
      payload:
        daily,
      name: 'Ada',
      image:
        null,
      userId:
        'author',
      handle:
        'ada',
      email:
        'ada@example.com',
    };

  it('sends only the fields sharedResultRes names', async () => {
    h.getSharedResult.mockResolvedValue(
      {
        ...live,
        payload:
          {
            ...daily,
            userId:
              'author',
          },
      },
    );
    const body =
      await getShared(
        true,
      );
    const text =
      JSON.stringify(
        body,
      );
    for (const leak of [
      'author',
      'ada@example.com',
      '"ada"',
      'userId',
      'handle',
      'email',
    ]) {
      expect(
        text,
      ).not.toContain(
        leak,
      );
    }
    expect(
      body,
    ).toEqual(
      {
        state:
          'live',
        id: 'share1',
        mine: false,
        payload:
          daily,
        name: 'Ada',
        image:
          null,
        today: false,
      },
    );
  });

  it('sends the share id to a signed-in viewer only', async () => {
    h.getSharedResult.mockResolvedValue(
      live,
    );
    const anon =
      await getShared(
        false,
      );
    expect(
      anon,
    ).not.toHaveProperty(
      'id',
    );
    expect(
      anon.mine,
    ).toBe(
      false,
    );
    expect(
      h
        .getSharedResult
        .mock
        .calls[0]![1],
    ).toBeNull();

    const signed =
      await getShared(
        true,
      );
    expect(
      signed.id,
    ).toBe(
      'share1',
    );
    expect(
      h
        .getSharedResult
        .mock
        .calls[1]![1],
    ).toBe(
      'viewer',
    );
  });

  it('says when the signed-in viewer made the link (the page hides Report then)', async () => {
    h.getSharedResult.mockResolvedValue(
      {
        ...live,
        mine: true,
      },
    );
    expect(
      (
        await getShared(
          true,
        )
      )
        .mine,
    ).toBe(
      true,
    );
  });

  it('a gone link is only { state: "gone" }', async () => {
    h.getSharedResult.mockResolvedValue(
      {
        state:
          'gone',
        id: 'share1',
        userId:
          'author',
      },
    );
    expect(
      await getShared(
        true,
      ),
    ).toEqual(
      {
        state:
          'gone',
      },
    );
  });
});
