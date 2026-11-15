import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  NEWS_FEEDS,
  dedupeNews,
  googleNewsFeed,
  isElectionRelevant,
  normalizeNewsItem,
  stripHtml,
  tagStates,
} from '../news';

const NPR =
  NEWS_FEEDS[0];
const NOW =
  Date.parse(
    '2026-11-04T03:00:00Z',
  );

describe('stripHtml', () => {
  it('removes tags, scripts and decodes entities', () => {
    expect(
      stripHtml(
        '<p>Tom &amp; Jerry&#39;s <b>win</b><script>evil()</script> &#x2014; ok</p>',
      ),
    ).toBe(
      "Tom & Jerry's win — ok",
    );
    expect(
      stripHtml(
        'a&nbsp;&nbsp;b',
      ),
    ).toBe(
      'a b',
    );
    expect(
      stripHtml(
        '&#9999999999; x',
      ),
    ).toBe(
      'x',
    );
  });
});

describe('isElectionRelevant', () => {
  it.each(
    [
      'Senate primary results in Texas',
      'Polls close in Georgia at 7 p.m.',
      'Candidate concedes the race',
      'Turnout surges in battleground states',
    ],
  )(
    'yes: %s',
    (
      t,
    ) => {
      expect(
        isElectionRelevant(
          t,
        ),
      ).toBe(
        true,
      );
    },
  );
  it.each(
    [
      'Celebrity chef opens new restaurant',
      'Stock market closes higher',
      'New study on sleep',
    ],
  )(
    'no: %s',
    (
      t,
    ) => {
      expect(
        isElectionRelevant(
          t,
        ),
      ).toBe(
        false,
      );
    },
  );
});

describe('tagStates', () => {
  it('finds named states, and only counts ambiguous names with a cue', () => {
    expect(
      tagStates(
        'Ohio and Pennsylvania voters',
      ),
    ).toEqual(
      [
        'OH',
        'PA',
      ],
    );
    expect(
      tagStates(
        'Washington says the Senate will vote',
      ),
    ).toEqual(
      [],
    ); // the city
    expect(
      tagStates(
        'Washington state primary results',
      ),
    ).toEqual(
      [
        'WA',
      ],
    );
    expect(
      tagStates(
        'Georgia Senate runoff looms',
      ),
    ).toEqual(
      [
        'GA',
      ],
    );
    expect(
      tagStates(
        'Georgia and Armenia sign a pact',
      ),
    ).toEqual(
      [],
    );
  });
});

describe('normalizeNewsItem', () => {
  const item =
    {
      title:
        'Senate primary results: Whatley wins GOP nod',
      link: 'https://example.org/a?x=1',
      isoDate:
        '2026-11-04T02:00:00Z',
      contentSnippet:
        'RALEIGH — Republicans in North Carolina chose their nominee.',
    };
  it('cleans a relevant item', () => {
    const n =
      normalizeNewsItem(
        item,
        NPR,
        NOW,
      )!;
    expect(
      n.source,
    ).toBe(
      'NPR',
    );
    expect(
      n.url,
    ).toBe(
      'https://example.org/a?x=1',
    );
    expect(
      n.states,
    ).toEqual(
      [],
    ); // the headline names no state
    expect(
      n.snippet,
    ).toContain(
      'Republicans',
    );
    expect(
      n.publishedAt,
    ).toBe(
      '2026-11-04T02:00:00.000Z',
    );
  });
  it('tags states from the headline', () => {
    expect(
      normalizeNewsItem(
        {
          ...item,
          title:
            'Ohio voters head to the polls for the Senate race',
        },
        NPR,
        NOW,
      )
        ?.states,
    ).toEqual(
      [
        'OH',
      ],
    );
  });
  it('rejects non-election, unsafe-link and too-short items', () => {
    expect(
      normalizeNewsItem(
        {
          ...item,
          title:
            'Local bakery wins regional award',
          contentSnippet:
            'Fresh bread.',
        },
        NPR,
        NOW,
      ),
    ).toBeNull();
    expect(
      normalizeNewsItem(
        {
          ...item,
          link: 'javascript:alert(1)',
        },
        NPR,
        NOW,
      ),
    ).toBeNull();
    expect(
      normalizeNewsItem(
        {
          ...item,
          link: 'ftp://x/y',
        },
        NPR,
        NOW,
      ),
    ).toBeNull();
    expect(
      normalizeNewsItem(
        {
          ...item,
          title:
            'Vote',
        },
        NPR,
        NOW,
      ),
    ).toBeNull();
    expect(
      normalizeNewsItem(
        {
          ...item,
          link: undefined,
        },
        NPR,
        NOW,
      ),
    ).toBeNull();
  });
  it('never dates an item in the future', () => {
    expect(
      normalizeNewsItem(
        {
          ...item,
          isoDate:
            '2030-01-01T00:00:00Z',
        },
        NPR,
        NOW,
      )
        ?.publishedAt,
    ).toBe(
      new Date(
        NOW,
      ).toISOString(),
    );
  });
  it('splits Google News "Headline - Outlet" and drops its junk description', () => {
    const g =
      normalizeNewsItem(
        {
          title:
            'Georgia Senate runoff results - The Atlanta Journal-Constitution',
          link: 'https://news.google.com/x',
          isoDate:
            '2026-11-04T01:00:00Z',
          contentSnippet:
            'Georgia Senate runoff results The Atlanta Journal-Constitution',
        },
        googleNewsFeed(
          'x',
        ),
        NOW,
      )!;
    expect(
      g.title,
    ).toBe(
      'Georgia Senate runoff results',
    );
    expect(
      g.source,
    ).toBe(
      'The Atlanta Journal-Constitution',
    );
    expect(
      g.snippet,
    ).toBe(
      '',
    );
  });
  it('caps title and snippet lengths and strips markup from them', () => {
    const n =
      normalizeNewsItem(
        {
          ...item,
          title:
            '<b>Election</b> ' +
            'x'.repeat(
              400,
            ),
          contentSnippet:
            '<p>' +
            'y'.repeat(
              500,
            ) +
            '</p>',
        },
        NPR,
        NOW,
      )!;
    expect(
      n
        .title
        .length,
    ).toBeLessThanOrEqual(
      200,
    );
    expect(
      n
        .snippet
        .length,
    ).toBeLessThanOrEqual(
      200,
    );
    expect(
      n.title,
    ).not.toContain(
      '<',
    );
  });
});

describe('dedupeNews', () => {
  it('collapses the same story across outlets (keeping the earliest) and sorts newest first', () => {
    const a =
      normalizeNewsItem(
        {
          title:
            'Senate primary results are in for Texas',
          link: 'https://a.com/1',
          isoDate:
            '2026-11-04T01:00:00Z',
        },
        NPR,
        NOW,
      )!;
    const b =
      normalizeNewsItem(
        {
          title:
            'Senate Primary Results Are In For Texas!',
          link: 'https://b.com/1',
          isoDate:
            '2026-11-04T02:00:00Z',
        },
        NEWS_FEEDS[1],
        NOW,
      )!;
    const c =
      normalizeNewsItem(
        {
          title:
            'Polls close in Georgia tonight at seven',
          link: 'https://c.com/1',
          isoDate:
            '2026-11-04T02:30:00Z',
        },
        NEWS_FEEDS[2],
        NOW,
      )!;
    const out =
      dedupeNews(
        [
          a,
          b,
          c,
        ],
      );
    expect(
      out,
    ).toHaveLength(
      2,
    );
    expect(
      out[0]
        .url,
    ).toBe(
      'https://c.com/1',
    );
    expect(
      out[1]
        .source,
    ).toBe(
      'NPR',
    );
  });
});
