/** s05-10 admin lookup: the pure half. What a pasted string is, which kinds it is tried against, the audit text. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  LOOKUP_KINDS,
  auditDetail,
  classifyLookup,
  excerpt,
  idShapeOf,
  parseSitePath,
  planLookup,
} from '@/lib/admin/lookup';

const CUID =
  'cm1abcdefghijklmnopqrstuv';
const UUID =
  '3f2b8c1e-9d4a-4e6b-8a1f-0c2d3e4f5a6b';
const SITE =
  'https://rmhstudios.com';

describe('classifyLookup: ids', () => {
  it('recognises a cuid, a uuid and a bigint', () => {
    expect(
      classifyLookup(
        CUID,
      ),
    ).toEqual(
      {
        type: 'id',
        id: CUID,
        shape:
          'cuid',
      },
    );
    expect(
      classifyLookup(
        UUID.toUpperCase(),
      ),
    ).toMatchObject(
      {
        type: 'id',
        shape:
          'uuid',
      },
    );
    expect(
      classifyLookup(
        ' 1234 ',
      ),
    ).toEqual(
      {
        type: 'id',
        id: '1234',
        shape:
          'bigint',
      },
    );
  });
  it('keeps a bigint inside 18 digits and rejects a leading zero', () => {
    expect(
      idShapeOf(
        '999999999999999999',
      ),
    ).toBe(
      'bigint',
    );
    expect(
      idShapeOf(
        '1000000000000000000',
      ),
    ).toBeNull();
    expect(
      idShapeOf(
        '0123',
      ),
    ).toBeNull();
    expect(
      idShapeOf(
        '0',
      ),
    ).toBeNull();
  });
});

describe('classifyLookup: handles and e-mail', () => {
  it('takes a handle with or without @, in any case', () => {
    expect(
      classifyLookup(
        'alice',
      ),
    ).toEqual(
      {
        type: 'handle',
        handle:
          'alice',
      },
    );
    expect(
      classifyLookup(
        '@Alice_1',
      ),
    ).toEqual(
      {
        type: 'handle',
        handle:
          'alice_1',
      },
    );
  });
  it('takes a full e-mail address, lower-cased', () => {
    expect(
      classifyLookup(
        'Alice.B+tag@Example.com',
      ),
    ).toEqual(
      {
        type: 'email',
        email:
          'alice.b+tag@example.com',
      },
    );
  });
  it('is junk for a partial e-mail address, a bad handle and a blank or over-long input', () => {
    for (const q of [
      '@example.com',
      'alice@',
      'alice@example',
      'a b',
      'ab',
      '9abc',
      '',
      '   ',
      'x'.repeat(
        501,
      ),
    ])
      expect(
        classifyLookup(
          q,
        ),
      ).toEqual(
        {
          type: 'junk',
        },
      );
  });
});

describe('classifyLookup: links', () => {
  const cases: Array<
    [
      string,
      unknown,
    ]
  > =
    [
      [
        `${SITE}/u/alice`,
        {
          kind: 'user',
          key: 'alice',
        },
      ],
      [
        `${SITE}/u/@alice/`,
        {
          kind: 'user',
          key: 'alice',
        },
      ],
      [
        `${SITE}/u/${CUID}`,
        {
          kind: 'user',
          key: CUID,
        },
      ],
      [
        `${SITE}/u/alice/post/${CUID}`,
        {
          kind: 'post',
          key: CUID,
        },
      ],
      [
        `${SITE}/thread/${CUID}`,
        {
          kind: 'post',
          key: CUID,
        },
      ],
      [
        `${SITE}/c/chess-club`,
        {
          kind: 'community',
          key: 'chess-club',
        },
      ],
      [
        `${SITE}/tournaments/${CUID}`,
        {
          kind: 'tournament',
          key: CUID,
        },
      ],
      [
        `${SITE}/jams/winter-jam`,
        {
          kind: 'jam',
          key: 'winter-jam',
        },
      ],
      [
        `${SITE}/create/builds/my-game`,
        {
          kind: 'build',
          key: 'my-game',
        },
      ],
      [
        `${SITE}/builds/my-game`,
        {
          kind: 'build',
          key: 'my-game',
        },
      ],
      [
        `${SITE}/replays/${CUID}`,
        {
          kind: 'replay',
          key: CUID,
        },
      ],
      [
        `${SITE}/library/a-book`,
        {
          kind: 'library',
          key: 'a-book',
        },
      ],
      [
        `${SITE}/news/a-story`,
        {
          kind: 'news',
          key: 'a-story',
        },
      ],
      [
        `${SITE}/blog/a-log`,
        {
          kind: 'blog',
          key: 'a-log',
        },
      ],
      [
        `https://www.rmhstudios.com/u/alice?x=1#top`,
        {
          kind: 'user',
          key: 'alice',
        },
      ],
      [
        `/u/alice`,
        {
          kind: 'user',
          key: 'alice',
        },
      ],
      [
        `rmhstudios.com/c/chess-club`,
        {
          kind: 'community',
          key: 'chess-club',
        },
      ],
    ];
  it.each(
    cases,
  )(
    'parses %s',
    (
      q,
      target,
    ) => {
      expect(
        classifyLookup(
          q,
        ),
      ).toEqual(
        {
          type: 'site-link',
          target,
        },
      );
    },
  );
  it('says a link on another host is foreign, including look-alikes and protocol-relative links', () => {
    for (const q of [
      'https://example.com/u/alice',
      'https://rmhstudios.com.evil.example/u/alice',
      'https://evil.example/?rmhstudios.com/u/alice',
      'https://user@evil.example/u/alice',
      '//evil.example/u/alice',
    ])
      expect(
        classifyLookup(
          q,
        ),
      ).toEqual(
        {
          type: 'foreign-link',
        },
      );
  });
  it('says an unrecognised path on this site is an unknown path', () => {
    for (const q of [
      `${SITE}/`,
      `${SITE}/nowhere`,
      `${SITE}/u/alice/followers`,
      `${SITE}/create/builds`,
      `/u/%2e%2e`,
    ])
      expect(
        classifyLookup(
          q,
        ),
      ).toEqual(
        {
          type: 'unknown-path',
        },
      );
  });
  it('is junk for another scheme or an unparsable link', () => {
    expect(
      classifyLookup(
        'javascript:alert(1)',
      ),
    ).toEqual(
      {
        type: 'junk',
      },
    );
    expect(
      classifyLookup(
        'https://',
      ),
    ).toEqual(
      {
        type: 'junk',
      },
    );
  });
  it('rejects a path segment that is not an id or a slug', () => {
    expect(
      parseSitePath(
        '/u/%E0%A4%A',
      ),
    ).toBeNull();
    expect(
      parseSitePath(
        '/c/<script>',
      ),
    ).toBeNull();
  });
});

describe('planLookup', () => {
  it('tries a cuid or a uuid only against string-keyed kinds', () => {
    for (const q of [
      CUID,
      UUID,
    ]) {
      const kinds =
        planLookup(
          classifyLookup(
            q,
          ),
        ).map(
          (
            c,
          ) =>
            c.kind,
        );
      expect(
        kinds,
      ).toEqual(
        [
          'user',
          'post',
          'comment',
          'community',
          'event',
          'tournament',
          'build',
          'replay',
          'report',
          'note',
        ],
      );
    }
  });
  it('tries a bigint only against the outbox', () => {
    expect(
      planLookup(
        classifyLookup(
          '77',
        ),
      ),
    ).toEqual(
      [
        {
          kind: 'outbox',
          by: 'id',
          key: '77',
        },
      ],
    );
  });
  it('asks one unique key per input otherwise', () => {
    expect(
      planLookup(
        classifyLookup(
          '@alice',
        ),
      ),
    ).toEqual(
      [
        {
          kind: 'user',
          by: 'handle',
          key: 'alice',
        },
      ],
    );
    expect(
      planLookup(
        classifyLookup(
          'a@b.co',
        ),
      ),
    ).toEqual(
      [
        {
          kind: 'user',
          by: 'email',
          key: 'a@b.co',
        },
      ],
    );
    expect(
      planLookup(
        classifyLookup(
          `${SITE}/c/x`,
        ),
      ),
    ).toEqual(
      [
        {
          kind: 'community',
          by: 'slug',
          key: 'x',
        },
      ],
    );
    expect(
      planLookup(
        classifyLookup(
          `${SITE}/u/x`,
        ),
      ),
    ).toEqual(
      [
        {
          kind: 'user',
          by: 'user-key',
          key: 'x',
        },
      ],
    );
    expect(
      planLookup(
        classifyLookup(
          `${SITE}/replays/${CUID}`,
        ),
      ),
    ).toEqual(
      [
        {
          kind: 'replay',
          by: 'id',
          key: CUID,
        },
      ],
    );
  });
  it('plans nothing for a foreign link, an unknown path or junk', () => {
    for (const q of [
      'https://example.com',
      `${SITE}/nowhere`,
      '???',
    ])
      expect(
        planLookup(
          classifyLookup(
            q,
          ),
        ),
      ).toEqual(
        [],
      );
  });
  it('never plans a private-message kind', () => {
    expect(
      LOOKUP_KINDS.join(
        ' ',
      ),
    ).not.toMatch(
      /dm|direct|group|chat|message/,
    );
  });
});

describe('excerpt and auditDetail', () => {
  it('collapses whitespace and cuts at 80 characters', () => {
    expect(
      excerpt(
        'a \n  b',
      ),
    ).toBe(
      'a b',
    );
    const cut =
      excerpt(
        'word '.repeat(
          40,
        ),
      );
    expect(
      cut.length,
    ).toBeLessThanOrEqual(
      80,
    );
    expect(
      cut.endsWith(
        '…',
      ),
    ).toBe(
      true,
    );
  });
  it('records the input kind and the ids, and caps the list', () => {
    expect(
      auditDetail(
        'email',
        [
          {
            kind: 'user',
            id: 'u1',
          },
        ],
      ),
    ).toBe(
      'input=email found=user:u1',
    );
    expect(
      auditDetail(
        'handle',
        [],
      ),
    ).toBe(
      'input=handle found=none',
    );
    const many =
      Array.from(
        {
          length: 12,
        },
        (
          _,
          i,
        ) => ({
          kind: 'user' as const,
          id: `u${i}`,
        }),
      );
    expect(
      auditDetail(
        'id',
        many,
      ),
    ).toMatch(
      / \+2$/,
    );
  });
});
