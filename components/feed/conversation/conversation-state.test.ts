import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  appendUnique,
  applyMutationTo,
  applySyncPatches,
  dateSeparatorKind,
  fromStreamMessage,
  fromVoiceMessage,
  insertSorted,
  isTempId,
  lastOwnMessageId,
  quotePrefix,
  replyTargetId,
  shouldShowDateSeparator,
  suggestionContext,
  toggleReactionRow,
  type Message,
} from './conversation-state';

const msg =
  (
    id: string,
    senderId: string,
    extra: Partial<Message> = {},
  ): Message => ({
    id,
    content: `c-${id}`,
    senderId,
    read: false,
    createdAt:
      '2024-03-04T10:00:00Z',
    ...extra,
  });

describe('applyMutationTo', () => {
  it('edits only the targeted message', () => {
    const out =
      applyMutationTo(
        [
          msg(
            'a',
            'x',
          ),
          msg(
            'b',
            'x',
          ),
        ],
        {
          conversationId:
            'c',
          messageId:
            'b',
          content:
            'new',
          editedAt:
            'T',
          deletedAt:
            null,
          deletedBy:
            null,
        },
      );
    expect(
      out[0]
        .content,
    ).toBe(
      'c-a',
    );
    expect(
      out[1],
    ).toMatchObject(
      {
        content:
          'new',
        editedAt:
          'T',
        deletedAt:
          null,
      },
    );
  });
  it('a tombstone drops media and reactions', () => {
    const [
      out,
    ] =
      applyMutationTo(
        [
          msg(
            'a',
            'x',
            {
              gifUrl:
                'g',
              imageUrls:
                [
                  'i',
                ],
              audioUrl:
                'a',
              reactions:
                [
                  {
                    emoji:
                      '👍',
                    userId:
                      'y',
                  },
                ],
            },
          ),
        ],
        {
          conversationId:
            'c',
          messageId:
            'a',
          content:
            '',
          editedAt:
            null,
          deletedAt:
            'D',
          deletedBy:
            'sender',
        },
      );
    expect(
      out,
    ).toMatchObject(
      {
        gifUrl:
          null,
        imageUrls:
          [],
        audioUrl:
          null,
        audioDurationMs:
          null,
        audioPeaks:
          [],
        reactions:
          [],
        deletedBy:
          'sender',
      },
    );
  });
});

describe('applySyncPatches', () => {
  it('removes hidden messages and patches changed ones, keeping reactions unless deleted', () => {
    const reactions =
      [
        {
          emoji:
            '👍',
          userId:
            'y',
        },
      ];
    const prev =
      [
        msg(
          'a',
          'x',
        ),
        msg(
          'b',
          'x',
          {
            reactions,
          },
        ),
        msg(
          'c',
          'x',
          {
            reactions,
          },
        ),
      ];
    const out =
      applySyncPatches(
        prev,
        new Set(
          [
            'a',
          ],
        ),
        new Map(
          [
            [
              'b',
              {
                id: 'b',
                content:
                  'edited',
                editedAt:
                  'T',
              },
            ],
            [
              'c',
              {
                id: 'c',
                content:
                  '',
                deletedAt:
                  'D',
              },
            ],
          ],
        ),
      );
    expect(
      out.map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toEqual(
      [
        'b',
        'c',
      ],
    );
    expect(
      out[0],
    ).toMatchObject(
      {
        content:
          'edited',
        editedAt:
          'T',
        imageUrls:
          [],
        reactions,
      },
    );
    expect(
      out[1]
        .reactions,
    ).toEqual(
      [],
    );
  });
});

describe('toggleReactionRow', () => {
  it('adds then removes the viewer reaction, leaving others alone', () => {
    const base =
      [
        msg(
          'a',
          'x',
          {
            reactions:
              [
                {
                  emoji:
                    '👍',
                  userId:
                    'other',
                },
              ],
          },
        ),
      ];
    const added =
      toggleReactionRow(
        base,
        'a',
        '👍',
        'me',
      );
    expect(
      added[0]
        .reactions,
    ).toHaveLength(
      2,
    );
    const removed =
      toggleReactionRow(
        added,
        'a',
        '👍',
        'me',
      );
    expect(
      removed[0]
        .reactions,
    ).toEqual(
      [
        {
          emoji:
            '👍',
          userId:
            'other',
        },
      ],
    );
  });
});

describe('list helpers', () => {
  it('appendUnique ignores duplicates', () => {
    const a =
      msg(
        'a',
        'x',
      );
    expect(
      appendUnique(
        [
          a,
        ],
        a,
      ),
    ).toHaveLength(
      1,
    );
    expect(
      appendUnique(
        [
          a,
        ],
        msg(
          'b',
          'x',
        ),
      ),
    ).toHaveLength(
      2,
    );
  });
  it('insertSorted restores chronological order', () => {
    const early =
      msg(
        'e',
        'x',
        {
          createdAt:
            '2024-01-01T00:00:00Z',
        },
      );
    const out =
      insertSorted(
        [
          msg(
            'l',
            'x',
          ),
        ],
        early,
      );
    expect(
      out.map(
        (
          m,
        ) =>
          m.id,
      ),
    ).toEqual(
      [
        'e',
        'l',
      ],
    );
  });
  it('isTempId marks optimistic bubbles', () => {
    expect(
      isTempId(
        'temp-1',
      ),
    ).toBe(
      true,
    );
    expect(
      isTempId(
        'abc',
      ),
    ).toBe(
      false,
    );
  });
});

describe('quotePrefix', () => {
  it('collapses whitespace and truncates to 80 characters', () => {
    expect(
      quotePrefix(
        'a \n  b',
      ),
    ).toBe(
      '> a b\n',
    );
    expect(
      quotePrefix(
        'x'.repeat(
          100,
        ),
      ),
    ).toBe(
      `> ${'x'.repeat(80)}…\n`,
    );
  });
});

describe('replyTargetId', () => {
  it('only suggests answering their newest, live, non-empty message', () => {
    expect(
      replyTargetId(
        [
          msg(
            'a',
            'them',
          ),
        ],
        'me',
      ),
    ).toBe(
      'a',
    );
    expect(
      replyTargetId(
        [
          msg(
            'a',
            'me',
          ),
        ],
        'me',
      ),
    ).toBeNull();
    expect(
      replyTargetId(
        [
          msg(
            'a',
            'them',
            {
              deletedAt:
                'D',
            },
          ),
        ],
        'me',
      ),
    ).toBeNull();
    expect(
      replyTargetId(
        [
          msg(
            'a',
            'them',
            {
              content:
                '  ',
            },
          ),
        ],
        'me',
      ),
    ).toBeNull();
    expect(
      replyTargetId(
        [],
        'me',
      ),
    ).toBeNull();
  });
});

describe('suggestionContext', () => {
  it('names authors and leaves out tombstones and empty messages', () => {
    const out =
      suggestionContext(
        [
          msg(
            'a',
            'me',
          ),
          msg(
            'b',
            'them',
          ),
          msg(
            'c',
            'them',
            {
              deletedAt:
                'D',
            },
          ),
          msg(
            'd',
            'them',
            {
              content:
                ' ',
            },
          ),
        ],
        'me',
        null,
      );
    expect(
      out,
    ).toEqual(
      [
        {
          author:
            'Me',
          content:
            'c-a',
        },
        {
          author:
            'Them',
          content:
            'c-b',
        },
      ],
    );
    expect(
      suggestionContext(
        [
          msg(
            'b',
            'them',
          ),
        ],
        'me',
        'Ana',
      )[0]
        .author,
    ).toBe(
      'Ana',
    );
  });
});

describe('lastOwnMessageId', () => {
  it('finds the viewer’s latest message', () => {
    expect(
      lastOwnMessageId(
        [
          msg(
            'a',
            'me',
          ),
          msg(
            'b',
            'them',
          ),
          msg(
            'c',
            'me',
          ),
        ],
        'me',
      ),
    ).toBe(
      'c',
    );
    expect(
      lastOwnMessageId(
        [
          msg(
            'b',
            'them',
          ),
        ],
        'me',
      ),
    ).toBeUndefined();
  });
});

describe('stream and voice messages', () => {
  it('fromStreamMessage normalizes optional fields', () => {
    const out =
      fromStreamMessage(
        msg(
          'a',
          'x',
          {
            audioPeaks:
              undefined,
          },
        ),
      );
    expect(
      out,
    ).toMatchObject(
      {
        editedAt:
          null,
        deletedAt:
          null,
        audioUrl:
          null,
        audioPeaks:
          [],
        expiresAt:
          null,
        poll: null,
      },
    );
  });
  it('fromVoiceMessage builds an empty-media voice bubble', () => {
    const out =
      fromVoiceMessage(
        {
          id: 'v',
          content:
            '',
          senderId:
            'me',
          read: false,
          createdAt:
            'T',
          audioUrl:
            '/v',
          audioDurationMs: 1000,
        } as never,
      );
    expect(
      out,
    ).toMatchObject(
      {
        id: 'v',
        audioPeaks:
          [],
        imageUrls:
          [],
        reactions:
          [],
      },
    );
  });
});

describe('dates', () => {
  const now =
    new Date(
      '2024-03-05T12:00:00Z',
    );
  it('labels today, yesterday and older days', () => {
    expect(
      dateSeparatorKind(
        '2024-03-05T01:00:00Z',
        now,
      ),
    ).toEqual(
      {
        kind: 'today',
      },
    );
    expect(
      dateSeparatorKind(
        '2024-03-04T23:00:00Z',
        now,
      ),
    ).toEqual(
      {
        kind: 'yesterday',
      },
    );
    const older =
      dateSeparatorKind(
        '2023-12-25T12:00:00Z',
        now,
      );
    expect(
      older,
    ).toMatchObject(
      {
        kind: 'date',
      },
    );
    expect(
      (
        older as {
          text: string;
        }
      )
        .text,
    ).toMatch(
      /2023/,
    );
  });
  it('separates only across calendar days', () => {
    const a =
      msg(
        'a',
        'x',
        {
          createdAt:
            '2024-03-04T10:00:00Z',
        },
      );
    const b =
      msg(
        'b',
        'x',
        {
          createdAt:
            '2024-03-04T10:05:00Z',
        },
      );
    const c =
      msg(
        'c',
        'x',
        {
          createdAt:
            '2024-03-05T10:05:00Z',
        },
      );
    expect(
      shouldShowDateSeparator(
        a,
        null,
      ),
    ).toBe(
      true,
    );
    expect(
      shouldShowDateSeparator(
        b,
        a,
      ),
    ).toBe(
      false,
    );
    expect(
      shouldShowDateSeparator(
        c,
        b,
      ),
    ).toBe(
      true,
    );
  });
});
