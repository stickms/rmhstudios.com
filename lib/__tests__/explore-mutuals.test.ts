/**
 * "Who to follow" says who, among the accounts the viewer follows, already follows a suggestion (owner, 2026-11-13).
 * The names come from ONE grouped query for the whole page of suggestions, capped at two names and a total in the
 * database; a signed-out visitor costs no query at all, and a failed query costs the line, not the list.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const h =
  vi.hoisted(
    () => ({
      raw: [] as {
        text: string;
        values: unknown[];
      }[],
      rows: [] as unknown[],
      fail: false,
    }),
  );

vi.mock(
  '@/lib/cached.server',
  () => ({
    cached:
      async (
        k: string,
        _t: number,
        fn: () => unknown,
      ) => {
        if (
          k ===
          'explore:list'
        ) {
          return {
            trendingTags:
              [],
            communities:
              [],
            libraryDocs:
              [],
            userPool:
              [
                {
                  id: 'dev',
                },
                {
                  id: 'eli',
                },
                {
                  id: 'gus',
                },
                {
                  id: 'followed',
                },
              ],
          };
        }
        if (
          k ===
          'explore:hot-candidates'
        )
          return {
            ids: [],
            fallback: false,
          };
        return fn();
      },
  }),
);
vi.mock(
  '@/lib/moderation.server',
  () => ({
    getHiddenAuthorIds:
      async () => [
        'blocked',
      ],
  }),
);
vi.mock(
  '@/lib/feed/map-feed-item.server',
  () => ({
    rmharkIncludeLite:
      () => ({}),
    mapRmharksWithBoundedReactions:
      async () => [],
  }),
);
vi.mock(
  '@/lib/feed/timeline',
  () => ({
    getMutedWords:
      async () => [],
    applyMutedWords:
      (
        items: unknown[],
      ) =>
        items,
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        $queryRaw:
          async (q: {
            text?: string;
            sql?: string;
            values: unknown[];
          }) => {
            h.raw.push(
              {
                text:
                  q.text ??
                  q.sql ??
                  '',
                values:
                  q.values,
              },
            );
            if (
              h.fail
            )
              throw new Error(
                'boom',
              );
            return h.rows;
          },
        follow:
          {
            findMany:
              async () => [
                {
                  followingId:
                    'followed',
                },
              ],
          },
        rMHark:
          {
            findMany:
              async () => [],
          },
      },
  }),
);

import { listExplore } from '@/lib/explore.server';

beforeEach(
  () => {
    h.raw.length = 0;
    h.rows =
      [];
    h.fail = false;
  },
);

describe('who to follow: followed by accounts you follow', () => {
  it('asks once for the whole page, for the suggestions only, leaving out hidden accounts', async () => {
    h.rows =
      [
        {
          followingId:
            'dev',
          total: 3,
          name: 'Ada',
          handle:
            'ada',
        },
        {
          followingId:
            'dev',
          total: 3,
          name: 'Ben',
          handle:
            'ben',
        },
        {
          followingId:
            'eli',
          total: 1,
          name: null,
          handle:
            'cleo',
        },
      ];
    const r =
      await listExplore(
        'viewer',
      );
    expect(
      h.raw,
    ).toHaveLength(
      1,
    );
    const q =
      h
        .raw[0]!;
    // The suggestions after the exact followed/self/hidden exclude, the viewer, and the hidden list.
    expect(
      q.values,
    ).toContainEqual(
      [
        'dev',
        'eli',
        'gus',
      ],
    );
    expect(
      q.values,
    ).toContain(
      'viewer',
    );
    expect(
      q.values,
    ).toContainEqual(
      [
        'blocked',
      ],
    );
    // Counted and capped in the database: two names a suggestion, however many there are.
    expect(
      q.text,
    ).toMatch(
      /COUNT\(\*\) OVER \(PARTITION BY f\."followingId"\)/,
    );
    expect(
      q.text,
    ).toMatch(
      /WHERE m\.rn <= \$\d+/,
    );
    expect(
      q.values,
    ).toContain(
      2,
    );

    const by =
      Object.fromEntries(
        r.suggestedUsers.map(
          (
            u,
          ) => [
            u.id,
            u.mutuals,
          ],
        ),
      );
    expect(
      by.dev,
    ).toEqual(
      {
        names:
          [
            'Ada',
            'Ben',
          ],
        count: 3,
      },
    );
    // No display name: the handle stands in.
    expect(
      by.eli,
    ).toEqual(
      {
        names:
          [
            '@cleo',
          ],
        count: 1,
      },
    );
    expect(
      by.gus,
    ).toBeUndefined();
  });

  it('runs no query for a signed-out visitor', async () => {
    const r =
      await listExplore(
        null,
      );
    expect(
      h.raw,
    ).toHaveLength(
      0,
    );
    expect(
      r.suggestedUsers.every(
        (
          u,
        ) =>
          u.mutuals ===
          undefined,
      ),
    ).toBe(
      true,
    );
  });

  it('keeps the suggestions when the query fails', async () => {
    h.fail = true;
    const r =
      await listExplore(
        'viewer',
      );
    expect(
      r.suggestedUsers.map(
        (
          u,
        ) =>
          u.id,
      ),
    ).toEqual(
      [
        'dev',
        'eli',
        'gus',
      ],
    );
    expect(
      r.suggestedUsers.every(
        (
          u,
        ) =>
          u.mutuals ===
          undefined,
      ),
    ).toBe(
      true,
    );
  });
});
