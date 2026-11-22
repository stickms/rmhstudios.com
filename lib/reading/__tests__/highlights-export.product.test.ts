import { describe, expect, it } from 'vitest';
import {
  citation,
  escapeMarkdown,
  groupByDocument,
  toCsv,
  toJson,
  toMarkdown,
  type ExportRow,
} from '../highlights-export';

function row(over: Partial<ExportRow>): ExportRow {
  return {
    id: 'h1',
    kind: 'blog',
    key: 'post',
    unit: '',
    start: 0,
    title: 'A Post',
    url: 'https://rmhstudios.com/blog/post',
    exact: 'a quote',
    note: null,
    isPublic: false,
    createdAt: '2026-11-21T10:00:00.000Z',
    ...over,
  };
}

describe('groupByDocument', () => {
  it('shows each document once, its highlights in reading order', () => {
    const groups = groupByDocument([
      row({
        id: 'a',
        exact: 'second',
        start: 50,
      }),
      row({
        id: 'b',
        kind: 'library',
        key: 'book',
        title: 'A Book',
        unit: '2',
        start: 5,
      }),
      row({
        id: 'c',
        exact: 'first',
        start: 4,
      }),
      row({
        id: 'd',
        kind: 'library',
        key: 'book',
        title: 'A Book',
        unit: '10',
        start: 1,
      }),
      row({
        id: 'e',
        kind: 'library',
        key: 'book',
        title: 'A Book',
        unit: '2',
        start: 1,
      }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['A Post', 'A Book']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['c', 'a']);
    // units compare numerically, then by offset
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['e', 'b', 'd']);
  });
});

describe('escapeMarkdown', () => {
  it('escapes < so user text cannot open raw HTML or an autolink', () => {
    expect(escapeMarkdown('<b>x</b>')).toBe('\\<b\\>x\\</b\\>');
  });

  it('escapes the characters that change structure', () => {
    expect(escapeMarkdown('# h > q *b* _i_ [l] `c` \\')).toBe('\\# h \\> q \\*b\\* \\_i\\_ \\[l\\] \\`c\\` \\\\');
  });

  it('escapes a leading list marker on every line', () => {
    expect(escapeMarkdown('- one\n  + two\n1. three\nfine - dash')).toBe('\\- one\n  \\+ two\n1\\. three\nfine - dash');
  });
});

describe('toMarkdown', () => {
  const groups = groupByDocument([
    row({
      id: 'a',
      exact: '# not a heading\n\nsecond paragraph',
      note: 'my *note*',
      start: 1,
    }),
    row({
      id: 'b',
      kind: 'news',
      key: 'n',
      title: 'News [1]',
      url: 'https://rmhstudios.com/news/n',
      exact: 'plain',
    }),
  ]);

  it('writes a heading per document and each quote as a blockquote with its note', () => {
    const md = toMarkdown(groups, {
      locale: 'en',
    });
    expect(md).toContain('# Reading highlights\n');
    expect(md).toContain('## [A Post](https://rmhstudios.com/blog/post)');
    expect(md).toContain('## [News \\[1\\]](https://rmhstudios.com/news/n)');
    expect(md).toContain('> \\# not a heading\n>\n> second paragraph');
    expect(md).toContain('**Note:** my \\*note\\*');
    expect(md.match(/^## /gm)).toHaveLength(2);
    expect(md.endsWith('\n')).toBe(true);
  });

  it('formats dates in the given locale', () => {
    expect(
      toMarkdown(groups, {
        locale: 'en',
      }),
    ).toContain('*Highlighted Nov 21, 2026*');
    expect(
      toMarkdown(groups, {
        locale: 'de',
      }),
    ).toContain('21.11.2026');
  });

  it('uses the supplied labels, and falls back to English for a bad locale', () => {
    const md = toMarkdown(groups, {
      locale: 'not a locale',
      labels: {
        heading: 'Notizen',
        note: 'Notiz',
        added: 'Markiert',
      },
    });
    expect(md).toContain('# Notizen');
    expect(md).toContain('**Notiz:**');
    expect(md).toContain('*Markiert Nov 21, 2026*');
  });
});

describe('toJson', () => {
  it('has one object per highlight with its document resolved', () => {
    const parsed = JSON.parse(
      toJson([
        row({
          note: 'n',
          isPublic: true,
        }),
      ]),
    );
    expect(parsed).toEqual([
      {
        id: 'h1',
        document: {
          type: 'blog',
          key: 'post',
          title: 'A Post',
          url: 'https://rmhstudios.com/blog/post',
        },
        quote: 'a quote',
        note: 'n',
        visibility: 'public',
        highlightedAt: '2026-11-21T10:00:00.000Z',
      },
    ]);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and guards formula starts', () => {
    const csv = toCsv([
      row({
        exact: 'a, "b"\nc',
        note: '=SUM(A1)',
      }),
      row({
        id: 'h2',
        exact: '@x',
        note: '\tfoo',
      }),
      row({
        id: 'h3',
        exact: '-1',
      }),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('document,type,url,quote,note,visibility,highlighted_at');
    expect(csv).toContain('"a, ""b""\nc",\'=SUM(A1),private');
    expect(csv).toContain(",'@x,'\tfoo,private");
    expect(csv).toContain(",'-1,,private");
  });
});

describe('citation', () => {
  it('is the quote, the title and the link as plain text', () => {
    expect(
      citation(
        row({
          exact: 'a quote',
        }),
      ),
    ).toBe('“a quote”\n— A Post\nhttps://rmhstudios.com/blog/post');
  });
});
