import { createHash } from 'node:crypto';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  assertNoLeak,
  NEEDLES,
  SDN_HOSTILE_NEEDLES,
} from '../../test-support';
import { SdnPageError } from './guard';
import { parseThreadPage } from './parse-thread';
import { readFixture } from './test-fixtures';

const hash =
  (
    id: string,
  ) =>
    `h(${id})`;
const hostile =
  () =>
    parseThreadPage(
      readFixture(
        'thread-hostile.html',
      ),
      hash,
    );

describe('parseThreadPage', () => {
  it('thread-small-p1 parses posts with a hash, a UTC postedAt and text', () => {
    const p =
      parseThreadPage(
        readFixture(
          'thread-small-p1.html',
        ),
        hash,
      );
    expect(
      p
        .posts
        .length,
    ).toBeGreaterThan(
      0,
    );
    for (const post of p.posts) {
      expect(
        post.postHash,
      ).toMatch(
        /^h\(\d+\)$/,
      );
      expect(
        post.postedAt,
      ).toBeInstanceOf(
        Date,
      );
      expect(
        Number.isNaN(
          post.postedAt.getTime(),
        ),
      ).toBe(
        false,
      );
    }
    expect(
      p.lastPage,
    ).toBe(
      1,
    );
  });
  it('hashPostId receives the raw id and the result is what postHash holds', () => {
    const p =
      hostile();
    expect(
      p.posts.map(
        (
          x,
        ) =>
          x.postHash,
      ),
    ).toEqual(
      [
        'h(8000001)',
        'h(8000002)',
        'h(8000003)',
        'h(8000004)',
      ],
    );
    expect(
      p.posts[0]?.postedAt.toISOString(),
    ).toBe(
      '2026-11-01T15:00:00.000Z',
    );
  });
  it('eventKey(type, day) is deterministic and differs per type and day', () => {
    const post =
      hostile()
        .posts[0];
    expect(
      post?.eventKey(
        'INTERVIEW',
        '2026-11-03',
      ),
    ).toBe(
      'h(8000001:INTERVIEW:2026-11-03)',
    );
    expect(
      post?.eventKey(
        'INTERVIEW',
        '2026-11-03',
      ),
    ).toBe(
      post?.eventKey(
        'INTERVIEW',
        '2026-11-03',
      ),
    );
    expect(
      post?.eventKey(
        'INTERVIEW',
        '2026-11-04',
      ),
    ).not.toBe(
      post?.eventKey(
        'INTERVIEW',
        '2026-11-03',
      ),
    );
    expect(
      post?.eventKey(
        'ACCEPTANCE',
        '2026-11-03',
      ),
    ).not.toBe(
      post?.eventKey(
        'INTERVIEW',
        '2026-11-03',
      ),
    );
  });
  it('blockquote is stripped before anything, nested too', () => {
    const [
      ,
      quoted,
      nested,
      plain,
    ] =
      hostile()
        .posts;
    expect(
      quoted?.text,
    ).toBe(
      '',
    );
    expect(
      nested?.text,
    ).toBe(
      'Congrats!',
    );
    expect(
      JSON.stringify(
        hostile(),
      ),
    ).not.toMatch(
      /quotedonlywords|outerquotedwords|innerquotedwords/,
    );
    expect(
      plain?.text,
    ).toBe(
      'Accepted on 11/10, so happy.',
    );
  });
  it('post text is redacted and signatures are ignored', () => {
    const text =
      hostile()
        .posts[0]
        ?.text ??
      '';
    expect(
      text,
    ).toContain(
      '[email]',
    );
    expect(
      text,
    ).toContain(
      '[link]',
    );
    expect(
      text.match(
        /\[user\]/g,
      ),
    ).toHaveLength(
      2,
    );
    expect(
      text,
    ).toContain(
      '\n',
    );
    expect(
      text,
    ).not.toContain(
      'sigzq',
    );
  });
  it('containsHandle is true for a page handle appearing in any string and false otherwise', () => {
    const p =
      hostile();
    expect(
      p.containsHandle(
        'the HOSTILE_author_zq wrote',
      ),
    ).toBe(
      true,
    );
    expect(
      p.containsHandle(
        'nothing here',
      ),
    ).toBe(
      false,
    );
  });
  it('lastPage is read from the pagination', () => {
    expect(
      parseThreadPage(
        readFixture(
          'thread-busy-last.html',
        ),
        hash,
      )
        .lastPage,
    ).toBe(
      6,
    );
  });
  it('thread-past-end.html is the last page, so lastPage still stops the walk', () => {
    const p =
      parseThreadPage(
        readFixture(
          'thread-past-end.html',
        ),
        hash,
      );
    expect(
      p.lastPage,
    ).toBe(
      6,
    );
    expect(
      p
        .posts
        .length,
    ).toBeGreaterThan(
      0,
    );
  });
  it('thread-challenge.html throws SdnPageError', () => {
    expect(
      () =>
        parseThreadPage(
          readFixture(
            'thread-challenge.html',
          ),
          hash,
        ),
    ).toThrow(
      SdnPageError,
    );
  });
  it('a page with zero posts throws, never returns []', () => {
    expect(
      () =>
        parseThreadPage(
          '<html><body><div class="block-body"></div></body></html>',
          hash,
        ),
    ).toThrow(
      SdnPageError,
    );
  });
  it('result exposes no author, handle, avatar or raw id', () => {
    const p =
      hostile();
    const dump =
      JSON.stringify(
        p,
      ) +
      p.posts
        .map(
          (
            x,
          ) =>
            x.text,
        )
        .join(
          '|',
        );
    for (const a of [
      'hostile_author_zq',
      'author-002',
      'author-003',
      'author-004',
      'user-002',
    ])
      expect(
        dump,
      ).not.toContain(
        a,
      );
    expect(
      Object.keys(
        p,
      ).sort(),
    ).toEqual(
      [
        'containsHandle',
        'lastPage',
        'posts',
      ],
    );
    assertNoLeak(
      [
        p,
        p.posts.map(
          (
            x,
          ) =>
            x.text,
        ),
      ],
      NEEDLES,
    );
    assertNoLeak(
      [
        p.posts.map(
          (
            x,
          ) =>
            x.text,
        ),
      ],
      [
        ...SDN_HOSTILE_NEEDLES,
      ],
    );
    const opaque =
      parseThreadPage(
        readFixture(
          'thread-hostile.html',
        ),
        (
          id,
        ) =>
          createHash(
            'sha256',
          )
            .update(
              id,
            )
            .digest(
              'hex',
            ),
      );
    expect(
      JSON.stringify(
        opaque,
      ),
    ).not.toMatch(
      /800000\d/,
    );
  });
});
