import {
  describe,
  expect,
  it,
} from 'vitest';
import { SdnPageError } from './guard';
import { parseForumListing } from './parse-listing';
import { readFixture } from './test-fixtures';

describe('parseForumListing', () => {
  it('1198 page 1 parses threads, drops sticky index rows and has a next page', () => {
    const {
      threads,
      hasNext,
    } =
      parseForumListing(
        readFixture(
          'forum-1198-p1.html',
        ),
      );
    expect(
      hasNext,
    ).toBe(
      true,
    );
    expect(
      threads.length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      threads.some(
        (
          t,
        ) =>
          /Alphabetic Index|Previous Years/i.test(
            t.title,
          ),
      ),
    ).toBe(
      false,
    );
    for (const t of threads) {
      expect(
        t.threadId,
      ).toBeGreaterThan(
        0,
      );
      expect(
        t.slug,
      ).not.toBe(
        '',
      );
      expect(
        t.lastActivityAt,
      ).toBeInstanceOf(
        Date,
      );
    }
  });
  it('last page has no next', () => {
    const html =
      readFixture(
        'forum-1198-p2.html',
      )
        .replace(
          /<link rel="next"[^>]*>/g,
          '',
        )
        .replace(
          /pageNav-jump--next/g,
          'x',
        );
    expect(
      parseForumListing(
        html,
      )
        .hasNext,
    ).toBe(
      false,
    );
  });
  it('abbreviated reply counts are unknown, plain counts are numbers', () => {
    const row =
      (
        dd: string,
      ) =>
        `<div class="structItem structItem--thread"><div class="structItem-title"><a href="/threads/a.7/" data-tp-primary="on">t</a></div><div class="structItem-cell--meta"><dl class="pairs"><dt>Replies</dt><dd>${dd}</dd></dl></div></div>`;
    expect(
      parseForumListing(
        row(
          '1.2K',
        ),
      )
        .threads[0]
        ?.replies,
    ).toBeNull();
    expect(
      parseForumListing(
        row(
          '1K',
        ),
      )
        .threads[0]
        ?.replies,
    ).toBeNull();
    expect(
      parseForumListing(
        row(
          '278',
        ),
      )
        .threads[0]
        ?.replies,
    ).toBe(
      278,
    );
  });
  it('962 and 603 are flat: their rows carry cycle labels in titles', () => {
    for (const f of [
      'forum-962-p1.html',
      'forum-603-p1.html',
    ])
      expect(
        parseForumListing(
          readFixture(
            f,
          ),
        ).threads.some(
          (
            t,
          ) =>
            /^\d{4}-\d{4} /.test(
              t.title,
            ),
        ),
      ).toBe(
        true,
      );
  });
  it('challenge body throws, an empty-forum page does not', () => {
    expect(
      () =>
        parseForumListing(
          readFixture(
            'thread-challenge.html',
          ),
        ),
    ).toThrow(
      SdnPageError,
    );
    expect(
      parseForumListing(
        '<p>There are no threads in this forum.</p>',
      )
        .threads,
    ).toEqual(
      [],
    );
  });
});
