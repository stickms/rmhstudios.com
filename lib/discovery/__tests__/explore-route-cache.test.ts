/**
 * `/api/explore` answers per viewer: "Who to follow" leaves out the accounts the viewer follows. A browser
 * stores a response under its URL alone unless the response says what else it depends on, so a body cached
 * while signed out is replayed after sign-in (and the other way round) for as long as `max-age` runs.
 * `Vary: Cookie` is what stops that; the wrapper adds it for a declared private policy, and this route sets
 * its own `Cache-Control`, so it has to say it itself.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const getSession =
  vi.fn();
vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          (
            ...a: unknown[]
          ) =>
            getSession(
              ...a,
            ),
      },
    },
  }),
);
vi.mock(
  '@/lib/explore.server',
  () => ({
    listExplore:
      vi.fn(
        async () => ({
          trendingTags:
            [],
          hotPosts:
            [],
          suggestedUsers:
            [],
          communities:
            [],
          libraryDocs:
            [],
        }),
      ),
  }),
);

import { route } from '@/lib/discovery/api/explore.server';

const get =
  (
    cookie?: string,
  ) =>
    route
      .handlers
      .GET!(
      {
        request:
          new Request(
            'https://rmhstudios.com/api/explore',
            {
              headers:
                {
                  'cf-connecting-ip': `${Math.random()}`,
                  ...(cookie
                    ? {
                        cookie,
                      }
                    : {}),
                },
            },
          ),
        params:
          {},
      },
    );

describe('GET /api/explore caching', () => {
  beforeEach(
    () => {
      getSession.mockReset();
    },
  );

  it('varies on Cookie when signed in, so a signed-out copy is never reused', async () => {
    getSession.mockResolvedValue(
      {
        user: {
          id: 'viewer',
        },
      },
    );
    const res =
      await get(
        'better-auth.session_token=abc',
      );
    expect(
      res.headers.get(
        'cache-control',
      ),
    ).toMatch(
      /private/,
    );
    expect(
      res.headers.get(
        'vary',
      ) ??
        '',
    ).toMatch(
      /cookie/i,
    );
  });

  it('varies on Cookie when signed out, so a signed-in copy is never reused', async () => {
    const res =
      await get();
    expect(
      res.headers.get(
        'vary',
      ) ??
        '',
    ).toMatch(
      /cookie/i,
    );
  });
});
