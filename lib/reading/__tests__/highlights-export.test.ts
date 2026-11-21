/* eslint-disable @typescript-eslint/no-explicit-any -- an in-memory stand-in for Prisma's loose where shapes */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * A member's reading notes leave the site in these exports, so what matters is
 * who they belong to: every query is scoped to the session user, ids that are
 * someone else's match nothing, the row cap holds, and a quote that a
 * spreadsheet would run as a formula is neutralised.
 */

type Row =
  Record<
    string,
    any
  >;
const db =
  vi.hoisted(
    () => ({
      highlights:
        [] as Row[],
      calls:
        [] as Row[],
    }),
  );

vi.mock(
  '@/lib/prisma.server',
  () => {
    const prisma =
      {
        readingHighlight:
          {
            findMany:
              vi.fn(
                async (
                  args: Row,
                ) => {
                  db.calls.push(
                    args,
                  );
                  const where =
                    args.where as Row;
                  let rows =
                    db.highlights.filter(
                      (
                        h,
                      ) =>
                        h.userId ===
                        where.userId,
                    );
                  if (
                    where
                      .id
                      ?.in
                  )
                    rows =
                      rows.filter(
                        (
                          h,
                        ) =>
                          where.id.in.includes(
                            h.id,
                          ),
                      );
                  return rows
                    .slice(
                      0,
                      args.take,
                    )
                    .map(
                      (
                        h,
                      ) => ({
                        ...h,
                      }),
                    );
                },
              ),
            count:
              vi.fn(
                async (
                  args: Row,
                ) => {
                  db.calls.push(
                    args,
                  );
                  return db.highlights.filter(
                    (
                      h,
                    ) =>
                      h.userId ===
                      args
                        .where
                        .userId,
                  )
                    .length;
                },
              ),
          },
        blogPost:
          {
            findMany:
              vi.fn(
                async () => [
                  {
                    slug: 'post',
                    title:
                      'A Post',
                  },
                ],
              ),
          },
        newsArticle:
          {
            findMany:
              vi.fn(
                async () => [],
              ),
          },
        libraryDocument:
          {
            findMany:
              vi.fn(
                async () => [],
              ),
          },
      };
    return {
      prisma,
    };
  },
);
vi.mock(
  '@/lib/moderation.server',
  () => ({
    getHiddenAuthorIds:
      async () => [],
  }),
);
vi.mock(
  '@/lib/library/library.server',
  () => ({
    getBook:
      async () =>
        undefined,
  }),
);
vi.mock(
  '../glossary.server',
  () => ({
    listGlossary:
      async () => [],
  }),
);

import {
  EXPORT_CAP,
  toCsv,
} from '../highlights-export';
import {
  exportHighlights,
  searchHighlights,
} from '../highlights.server';

function row(
  id: string,
  userId: string,
  exact = 'a quote',
): Row {
  return {
    id,
    userId,
    docKind:
      'blog',
    docKey:
      'post',
    unit: '',
    exact,
    prefix:
      '',
    suffix:
      '',
    start: 0,
    end: exact.length,
    version:
      '',
    note: null,
    isPublic: false,
    createdAt:
      new Date(
        '2026-11-21T10:00:00Z',
      ),
  };
}

beforeEach(
  () => {
    db.highlights =
      [
        row(
          'm1',
          'me',
        ),
        row(
          'm2',
          'me',
        ),
        row(
          'o1',
          'other',
        ),
      ];
    db.calls =
      [];
  },
);

describe('exportHighlights', () => {
  it('returns only the session user’s highlights, with the title and absolute link resolved', async () => {
    const rows =
      await exportHighlights(
        'me',
        {},
      );
    expect(
      rows.map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        'm1',
        'm2',
      ],
    );
    expect(
      rows[0],
    ).toMatchObject(
      {
        title:
          'A Post',
        url: 'https://rmhstudios.com/blog/post',
      },
    );
    expect(
      db
        .calls[0]!
        .where
        .userId,
    ).toBe(
      'me',
    );
  });

  it('ignores ids that are not the member’s instead of failing', async () => {
    const rows =
      await exportHighlights(
        'me',
        {},
        [
          'm2',
          'o1',
          'nope',
        ],
      );
    expect(
      rows.map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        'm2',
      ],
    );
    expect(
      db
        .calls[0]!
        .where
        .userId,
    ).toBe(
      'me',
    );
  });

  it('caps one export at 10,000 rows', async () => {
    await exportHighlights(
      'me',
      {},
    );
    expect(
      db
        .calls[0]!
        .take,
    ).toBe(
      EXPORT_CAP,
    );
    expect(
      EXPORT_CAP,
    ).toBe(
      10_000,
    );
  });

  it('applies the filter inside the member’s rows', async () => {
    await exportHighlights(
      'me',
      {
        q: 'gate',
        kind: 'news',
        hasNote: true,
        visibility:
          'public',
      },
    );
    expect(
      db
        .calls[0]!
        .where,
    ).toMatchObject(
      {
        userId:
          'me',
        docKind:
          'news',
        isPublic: true,
        note: {
          not: null,
        },
      },
    );
    expect(
      db
        .calls[0]!
        .where
        .OR,
    ).toEqual(
      [
        {
          exact:
            {
              contains:
                'gate',
              mode: 'insensitive',
            },
        },
        {
          note: {
            contains:
              'gate',
            mode: 'insensitive',
          },
        },
      ],
    );
  });

  it('feeds a CSV that does not evaluate a quote starting with =', async () => {
    db.highlights =
      [
        row(
          'm1',
          'me',
          '=HYPERLINK("http://evil","x")',
        ),
        row(
          'm2',
          'me',
          '+1 or -2',
        ),
        row(
          'm3',
          'me',
          'plain',
        ),
      ];
    const csv =
      toCsv(
        await exportHighlights(
          'me',
          {},
        ),
      );
    expect(
      csv,
    ).toContain(
      `"'=HYPERLINK(""http://evil"",""x"")"`,
    );
    expect(
      csv,
    ).toContain(
      `'+1 or -2`,
    );
    expect(
      csv,
    ).toContain(
      ',plain,',
    );
  });
});

describe('searchHighlights', () => {
  it('searches only the member’s rows and reports the total', async () => {
    const page =
      await searchHighlights(
        'me',
        {
          q: 'quote',
        },
        null,
      );
    expect(
      page.items.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        'm1',
        'm2',
      ],
    );
    expect(
      page.total,
    ).toBe(
      2,
    );
    expect(
      page.nextCursor,
    ).toBeNull();
    expect(
      db.calls.every(
        (
          c,
        ) =>
          c
            .where
            .userId ===
          'me',
      ),
    ).toBe(
      true,
    );
    expect(
      db
        .calls[0]!
        .where
        .OR,
    ).toHaveLength(
      2,
    );
  });

  it('pages with a cursor when more rows match than fit', async () => {
    const page =
      await searchHighlights(
        'me',
        {},
        null,
        1,
      );
    expect(
      page.items,
    ).toHaveLength(
      1,
    );
    expect(
      page.nextCursor,
    ).toBe(
      'm1',
    );
  });
});
