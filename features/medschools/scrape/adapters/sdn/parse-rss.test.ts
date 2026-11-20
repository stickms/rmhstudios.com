import {
  describe,
  expect,
  it,
} from 'vitest';
import { SdnPageError } from './guard';
import { parseForumRss } from './parse-rss';
import { readFixture } from './test-fixtures';

describe('parseForumRss', () => {
  const xml =
    readFixture(
      'forum-1198.rss',
    );
  const rows =
    parseForumRss(
      xml,
    );
  it('yields one row per item in forum-1198.rss', () => {
    expect(
      rows,
    ).toHaveLength(
      (
        xml.match(
          /<item>/g,
        ) ??
        []
      )
        .length,
    );
    expect(
      rows.length,
    ).toBeGreaterThan(
      0,
    );
    for (const r of rows) {
      expect(
        r.threadId,
      ).toBeGreaterThan(
        0,
      );
      expect(
        r.slug,
      ).not.toBe(
        '',
      );
      expect(
        r.comments,
      ).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        Number.isNaN(
          r.lastActivityAt.getTime(),
        ),
      ).toBe(
        false,
      );
    }
    expect(
      rows[0],
    ).toMatchObject(
      {
        threadId: 1517730,
        comments: 3,
      },
    );
    expect(
      rows[0]?.lastActivityAt.toISOString(),
    ).toBe(
      '2026-11-20T15:35:39.000Z',
    );
  });
  it('no row has an author field', () => {
    for (const r of rows)
      expect(
        Object.keys(
          r,
        ),
      ).toEqual(
        [
          'threadId',
          'slug',
          'title',
          'comments',
          'lastActivityAt',
        ],
      );
    expect(
      JSON.stringify(
        rows,
      ),
    ).not.toContain(
      'author-001',
    );
  });
  it('challenge body throws SdnPageError', () => {
    expect(
      () =>
        parseForumRss(
          readFixture(
            'thread-challenge.html',
          ),
        ),
    ).toThrow(
      SdnPageError,
    );
  });
  it('an RSS with channel but zero items returns []', () => {
    expect(
      parseForumRss(
        '<rss><channel><title>x</title></channel></rss>',
      ),
    ).toEqual(
      [],
    );
  });
  it('items that are all unparseable throw', () => {
    expect(
      () =>
        parseForumRss(
          '<rss><channel><item><title>x</title></item></channel></rss>',
        ),
    ).toThrow(
      SdnPageError,
    );
  });
});
