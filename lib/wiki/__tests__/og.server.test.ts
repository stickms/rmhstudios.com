/**
 * The wiki's link-preview card: what it reads from the wiki and what it draws.
 * The property that matters is that the card's words come from the wiki, never
 * from the query string, so a URL on rmhstudios.com cannot be made to render
 * arbitrary text. The wiki's API answers are the shapes MediaWiki 1.43.11 with
 * TextExtracts returned.
 */
import {
  afterEach,
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
      render:
        vi.fn(),
    }),
  );
vi.mock(
  '@/lib/og/page-card.server',
  () => ({
    renderPageCard:
      h.render,
  }),
);
vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          async () =>
            null,
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

import { route } from '@/lib/og/api/og.wiki.server';
import {
  fetchWikiCardPage,
  WIKI_NAME,
  WIKI_TAGLINE,
} from '@/lib/wiki/og.server';

const fetchMock =
  vi.fn();
const card =
  handlersOf(
    route,
  );
const answer =
  (
    pages: unknown[],
    mainpage = 'Main Page',
  ) =>
    new Response(
      JSON.stringify(
        {
          batchcomplete: true,
          query:
            {
              pages,
              general:
                {
                  mainpage,
                },
            },
        },
      ),
    );
const GAMES =
  {
    pageid: 3,
    ns: 0,
    title:
      'Games',
    lastrevid: 7,
    extract:
      'Every game on rmhstudios.com runs in the browser.\nScores are saved.',
  };

const get =
  (
    query: string,
  ) =>
    card.GET!(
      {
        request:
          new Request(
            `https://rmhstudios.com/api/og/wiki${query}`,
            {
              headers:
                {
                  'cf-connecting-ip': `${Math.random()}`,
                },
            },
          ),
        params:
          {},
      },
    );

beforeEach(
  () => {
    fetchMock.mockReset();
    h.render.mockReset();
    h.render.mockResolvedValue(
      Buffer.from(
        'png',
      ),
    );
    vi.stubGlobal(
      'fetch',
      fetchMock,
    );
    vi.stubEnv(
      'WIKI_PUBLIC_URL',
      'https://wiki.rmhstudios.com',
    );
  },
);
afterEach(
  () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  },
);

describe('fetchWikiCardPage', () => {
  it("asks the wiki's API for the page's opening sentences, following redirects", async () => {
    fetchMock.mockResolvedValue(
      answer(
        [
          GAMES,
        ],
      ),
    );
    await expect(
      fetchWikiCardPage(
        'games',
      ),
    ).resolves.toEqual(
      {
        title:
          'Games',
        extract:
          'Every game on rmhstudios.com runs in the browser. Scores are saved.',
        revision: 7,
        isMainPage: false,
      },
    );
    const url =
      new URL(
        fetchMock
          .mock
          .calls[0]![0] as string,
      );
    expect(
      url.origin +
        url.pathname,
    ).toBe(
      'https://wiki.rmhstudios.com/api.php',
    );
    expect(
      url.searchParams.get(
        'titles',
      ),
    ).toBe(
      'games',
    );
    expect(
      url.searchParams.get(
        'prop',
      ),
    ).toBe(
      'info|extracts',
    );
    expect(
      url.searchParams.get(
        'exintro',
      ),
    ).toBe(
      '1',
    );
    expect(
      url.searchParams.get(
        'explaintext',
      ),
    ).toBe(
      '1',
    );
    expect(
      url.searchParams.get(
        'redirects',
      ),
    ).toBe(
      '1',
    );
  });

  it('knows the main page', async () => {
    fetchMock.mockResolvedValue(
      answer(
        [
          {
            ...GAMES,
            title:
              'Main Page',
          },
        ],
      ),
    );
    expect(
      (
        await fetchWikiCardPage(
          'Main Page',
        )
      )
        ?.isMainPage,
    ).toBe(
      true,
    );
  });

  it('is null for a page the wiki does not have, an invalid title, or a wiki that does not answer', async () => {
    fetchMock.mockResolvedValueOnce(
      answer(
        [
          {
            ns: 0,
            title:
              'Nope',
            missing: true,
          },
        ],
      ),
    );
    await expect(
      fetchWikiCardPage(
        'Nope',
      ),
    ).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(
      answer(
        [
          {
            title:
              'a[b]',
            invalid: true,
          },
        ],
      ),
    );
    await expect(
      fetchWikiCardPage(
        'a[b]',
      ),
    ).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(
      new Response(
        '<html>502</html>',
        {
          status: 502,
        },
      ),
    );
    await expect(
      fetchWikiCardPage(
        'Games',
      ),
    ).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(
      new Error(
        'ECONNREFUSED',
      ),
    );
    await expect(
      fetchWikiCardPage(
        'Games',
      ),
    ).resolves.toBeNull();
  });
});

describe('GET /api/og/wiki', () => {
  it("draws a page's card from what the wiki says, under the wiki's address", async () => {
    fetchMock.mockResolvedValue(
      answer(
        [
          GAMES,
        ],
      ),
    );
    const res =
      await get(
        '?page=games',
      );
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
    ).toContain(
      's-maxage=',
    );
    expect(
      h.render,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          title:
            'Games',
          subtitle:
            'Every game on rmhstudios.com runs in the browser. Scores are saved.',
          host: 'wiki.rmhstudios.com',
          path: '/wiki/Games',
          // An edit is a new card.
          cacheKey:
            'wiki:Games:7',
        },
      ),
    );
  });

  it('never draws words from the query string: an unknown page gets the wiki card', async () => {
    fetchMock.mockResolvedValue(
      answer(
        [
          {
            ns: 0,
            title:
              'Buy cheap coins at evil.example',
            missing: true,
          },
        ],
      ),
    );
    await get(
      `?page=${encodeURIComponent('Buy cheap coins at evil.example')}`,
    );
    const drawn =
      JSON.stringify(
        h
          .render
          .mock
          .calls[0]![0],
      );
    expect(
      drawn,
    ).not.toContain(
      'evil.example',
    );
    expect(
      h.render,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          title:
            WIKI_NAME,
          subtitle:
            WIKI_TAGLINE,
          cacheKey:
            'wiki:main',
        },
      ),
    );
  });

  it('gives the main page, and no page at all, the wiki card without asking the wiki twice', async () => {
    fetchMock.mockResolvedValue(
      answer(
        [
          {
            ...GAMES,
            title:
              'Main Page',
          },
        ],
      ),
    );
    await get(
      '?page=Main%20Page',
    );
    await get(
      '',
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
    for (const [
      args,
    ] of h
      .render
      .mock
      .calls)
      expect(
        args,
      ).toMatchObject(
        {
          title:
            WIKI_NAME,
        },
      );
  });

  it('keeps sub-pages and colons readable in the footer path', async () => {
    fetchMock.mockResolvedValue(
      answer(
        [
          {
            ...GAMES,
            title:
              'Games/Balatro: tips',
          },
        ],
      ),
    );
    await get(
      '?page=x',
    );
    expect(
      h
        .render
        .mock
        .calls[0]![0]
        .path,
    ).toBe(
      '/wiki/Games/Balatro:_tips',
    );
  });

  it('refuses an oversized page name before asking the wiki', async () => {
    expect(
      (
        await get(
          `?page=${'x'.repeat(256)}`,
        )
      )
        .status,
    ).toBe(
      400,
    );
    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });
});
