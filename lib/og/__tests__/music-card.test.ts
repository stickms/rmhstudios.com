/**
 * The shared RMH Music result card (`GET /api/og/music/$token`, Phase 6 plan 1.4): drawn from the
 * stored snapshot through `renderPageCard`, 404 once the link is gone, cached ten minutes (not
 * immutable: stopping a link must kill the card), and no name unless the link shows it.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ogCardPath,
  OG_CARD_VERSION,
} from '@/lib/seo';

const h =
  vi.hoisted(
    () => ({
      view: null as unknown,
      render:
        vi.fn(
          async (
            _data: Record<
              string,
              unknown
            >,
          ) =>
            Buffer.from(
              'png',
            ),
        ),
      lookups:
        [] as unknown[][],
    }),
  );
vi.mock(
  '@/lib/rmhmusic/learn/social/share.server',
  () => ({
    getSharedResult:
      vi.fn(
        async (
          ...args: unknown[]
        ) => {
          h.lookups.push(
            args,
          );
          return h.view;
        },
      ),
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
  '@/lib/og/page-card.server',
  () => ({
    renderPageCard:
      h.render,
  }),
);

import { route } from '@/lib/og/api/og.music.$token.server';

const TOKEN =
  'AbCdEfGhIjKlMnOpQrSt_-';
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
const get =
  (
    token = TOKEN,
  ) =>
    route
      .handlers
      .GET!(
      {
        request:
          new Request(
            `https://rmhstudios.com/api/og/music/${token}`,
            {
              headers:
                {
                  'cf-connecting-ip': `${Math.random()}`,
                },
            },
          ),
        params:
          {
            token,
          },
      },
    );

beforeEach(
  () => {
    h.render.mockClear();
    h.lookups.length = 0;
  },
);

describe('GET /api/og/music/$token', () => {
  it('is named by ogCardPath with the card version', () => {
    expect(
      ogCardPath(
        'music',
        TOKEN,
      ),
    ).toBe(
      `/api/og/music/${TOKEN}?v=${OG_CARD_VERSION}`,
    );
  });

  it('is a 404 once the link is gone, and draws nothing', async () => {
    h.view =
      {
        state:
          'gone',
      };
    const res =
      await get();
    expect(
      res.status,
    ).toBe(
      404,
    );
    expect(
      h.render,
    ).not.toHaveBeenCalled();
  });

  it('tells search engines not to index the card, live or gone (a capability link is not an image result)', async () => {
    h.view =
      {
        state:
          'live',
        id: 's1',
        mine: false,
        payload:
          daily,
        name: null,
        image:
          null,
      };
    expect(
      (
        await get()
      ).headers.get(
        'x-robots-tag',
      ),
    ).toBe(
      'noindex',
    );
    h.view =
      {
        state:
          'gone',
      };
    expect(
      (
        await get()
      ).headers.get(
        'x-robots-tag',
      ),
    ).toBe(
      'noindex',
    );
  });

  it('reads the link as a signed-out viewer would (no viewer, so no block exceptions)', async () => {
    h.view =
      {
        state:
          'live',
        id: 's1',
        payload:
          daily,
        name: null,
        image:
          null,
      };
    await get();
    expect(
      h
        .lookups[0]?.[1],
    ).toBeNull();
  });

  it('draws the stored result, with no name when the link does not show it, cached ten minutes', async () => {
    h.view =
      {
        state:
          'live',
        id: 's1',
        payload:
          daily,
        name: null,
        image:
          null,
      };
    const res =
      await get();
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      res.headers.get(
        'content-type',
      ),
    ).toBe(
      'image/png',
    );
    expect(
      res.headers.get(
        'cache-control',
      ),
    ).toBe(
      'public, max-age=600, s-maxage=600',
    );
    const data =
      h
        .render
        .mock
        .calls[0]![0];
    expect(
      data,
    ).toMatchObject(
      {
        eyebrow:
          'RMH Music',
        lead: 'Daily sight reading · 15 Nov 2026',
        title:
          '92 points',
        subtitle:
          '28 of 30 right · 0.9 s a note',
        byline:
          null,
        path: '/rmhmusic',
        // One chip: the figure, then its label ("2 of 3 stars"), not the label twice.
        stats:
          [
            {
              value:
                '2 of 3',
              label:
                'stars',
              lead: true,
            },
          ],
      },
    );
    expect(
      JSON.stringify(
        data,
      ),
    ).not.toContain(
      'Ada',
    );
  });

  it('draws the name only when the link shows it, and the cache key changes with it', async () => {
    h.view =
      {
        state:
          'live',
        id: 's1',
        payload:
          daily,
        name: null,
        image:
          null,
      };
    await get();
    h.view =
      {
        state:
          'live',
        id: 's1',
        payload:
          daily,
        name: 'Ada',
        image:
          'https://img.example/a.png',
      };
    await get();
    const [
      a,
      b,
    ] =
      h.render.mock.calls.map(
        (
          c,
        ) =>
          c[0],
      );
    expect(
      b,
    ).toMatchObject(
      {
        byline:
          {
            name: 'Ada',
            image:
              'https://img.example/a.png',
          },
      },
    );
    expect(
      a!
        .cacheKey,
    ).not.toBe(
      b!
        .cacheKey,
    );
  });
});
