import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  MAX_IMAGES,
  appendImages,
  buildComposeBody,
  buildOptimisticItem,
  computeCanSubmit,
  counterToneClass,
  emptyPoll,
  isComposerEmpty,
  isGifPostable,
  isPollPostable,
  prependFailedContent,
  removeAt,
  setAltAt,
  threadBlockedBy,
  type ComposeBodyInput,
} from './compose-state';

const baseBody: ComposeBodyInput =
  {
    content:
      '',
    hasPoll: false,
    poll: emptyPoll(),
    pollDuration: 0,
    hasGif: false,
    gifUrl:
      '',
    hasImages: false,
    imageUrls:
      [],
    imageAlts:
      [],
    audience:
      'PUBLIC',
    isSensitive: false,
    isTake: false,
    replyControl:
      'EVERYONE',
    unlockPrice:
      '',
    featureFields:
      [],
  };

describe('emptyPoll', () => {
  it('returns a fresh object each call', () => {
    const a =
      emptyPoll();
    a.options.push(
      'x',
    );
    expect(
      emptyPoll()
        .options,
    ).toEqual(
      [
        '',
        '',
      ],
    );
  });
});

describe('isPollPostable / isGifPostable', () => {
  it('needs the poll attachment, a question and two filled options', () => {
    const poll =
      {
        question:
          'Q?',
        options:
          [
            'a',
            'b',
          ],
        multiSelect: false,
      };
    expect(
      isPollPostable(
        'poll',
        poll,
      ),
    ).toBe(
      true,
    );
    expect(
      isPollPostable(
        'gif',
        poll,
      ),
    ).toBe(
      false,
    );
    expect(
      isPollPostable(
        'poll',
        {
          ...poll,
          question:
            '  ',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isPollPostable(
        'poll',
        {
          ...poll,
          options:
            [
              'a',
              ' ',
            ],
        },
      ),
    ).toBe(
      false,
    );
  });
  it('needs the gif attachment and a non-blank url', () => {
    expect(
      isGifPostable(
        'gif',
        'https://x/y.gif',
      ),
    ).toBe(
      true,
    );
    expect(
      isGifPostable(
        'gif',
        '  ',
      ),
    ).toBe(
      false,
    );
    expect(
      isGifPostable(
        null,
        'https://x/y.gif',
      ),
    ).toBe(
      false,
    );
  });
});

describe('computeCanSubmit', () => {
  const ok =
    {
      hasContent: true,
      hasPoll: false,
      hasGif: false,
      hasImages: false,
      hasCodeEmbed: false,
      remaining: 10,
      submitting: false,
      uploadingCount: 0,
      missingAltCount: 0,
    };
  it('accepts any one kind of content', () => {
    expect(
      computeCanSubmit(
        ok,
      ),
    ).toBe(
      true,
    );
    expect(
      computeCanSubmit(
        {
          ...ok,
          hasContent: false,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      computeCanSubmit(
        {
          ...ok,
          hasContent: false,
          hasCodeEmbed: true,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      computeCanSubmit(
        {
          ...ok,
          hasContent: false,
          hasImages: true,
        },
      ),
    ).toBe(
      true,
    );
  });
  it('blocks over the limit, while submitting, uploading or missing alt text', () => {
    expect(
      computeCanSubmit(
        {
          ...ok,
          remaining:
            -1,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      computeCanSubmit(
        {
          ...ok,
          remaining: 0,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      computeCanSubmit(
        {
          ...ok,
          submitting: true,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      computeCanSubmit(
        {
          ...ok,
          uploadingCount: 1,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      computeCanSubmit(
        {
          ...ok,
          missingAltCount: 2,
        },
      ),
    ).toBe(
      false,
    );
  });
});

describe('threadBlockedBy', () => {
  const free =
    {
      hasImages: false,
      hasGif: false,
      hasPoll: false,
      audience:
        'PUBLIC' as const,
      isSensitive: false,
      replyControl:
        'EVERYONE' as const,
      unlockPrice:
        '',
    };
  it('prefers attachments over options', () => {
    expect(
      threadBlockedBy(
        free,
      ),
    ).toBeNull();
    expect(
      threadBlockedBy(
        {
          ...free,
          hasGif: true,
          isSensitive: true,
        },
      ),
    ).toBe(
      'attachments',
    );
    expect(
      threadBlockedBy(
        {
          ...free,
          audience:
            'PRIVATE',
        },
      ),
    ).toBe(
      'options',
    );
    expect(
      threadBlockedBy(
        {
          ...free,
          unlockPrice:
            '5',
        },
      ),
    ).toBe(
      'options',
    );
    expect(
      threadBlockedBy(
        {
          ...free,
          unlockPrice:
            '0',
        },
      ),
    ).toBeNull();
  });
});

describe('counterToneClass', () => {
  it('goes dim, warning, danger as room runs out', () => {
    expect(
      counterToneClass(
        100,
      ),
    ).toBe(
      'text-site-text-muted',
    );
    expect(
      counterToneClass(
        20,
      ),
    ).toBe(
      'text-site-warning',
    );
    expect(
      counterToneClass(
        1,
      ),
    ).toBe(
      'text-site-warning',
    );
    expect(
      counterToneClass(
        0,
      ),
    ).toBe(
      'text-site-danger',
    );
    expect(
      counterToneClass(
        -5,
      ),
    ).toBe(
      'text-site-danger',
    );
  });
});

describe('buildComposeBody', () => {
  it('is empty for an empty composer', () => {
    expect(
      buildComposeBody(
        baseBody,
      ),
    ).toEqual(
      {},
    );
  });
  it('trims content and sends only non-default options', () => {
    expect(
      buildComposeBody(
        {
          ...baseBody,
          content:
            '  hi  ',
          audience:
            'CIRCLE',
          isSensitive: true,
          isTake: true,
          replyControl:
            'MENTIONED',
          unlockPrice:
            '12',
          communityId:
            'c1',
        },
      ),
    ).toEqual(
      {
        content:
          'hi',
        audience:
          'CIRCLE',
        isSensitive: true,
        isTake: true,
        replyControl:
          'MENTIONED',
        unlockPrice: 12,
        communityId:
          'c1',
      },
    );
  });
  it('builds the poll with trimmed, non-empty options and an optional duration', () => {
    const poll =
      {
        question:
          ' Q ',
        options:
          [
            ' a ',
            '',
            'b',
          ],
        multiSelect: true,
      };
    expect(
      buildComposeBody(
        {
          ...baseBody,
          hasPoll: true,
          poll,
        },
      )
        .poll,
    ).toEqual(
      {
        question:
          'Q',
        options:
          [
            'a',
            'b',
          ],
        multiSelect: true,
      },
    );
    expect(
      (
        buildComposeBody(
          {
            ...baseBody,
            hasPoll: true,
            poll,
            pollDuration: 6,
          },
        )
          .poll as {
          durationHours: number;
        }
      )
        .durationHours,
    ).toBe(
      6,
    );
  });
  it('sends index-aligned alts only when one image is described', () => {
    const withImages =
      {
        ...baseBody,
        hasImages: true,
        imageUrls:
          [
            '/a',
            '/b',
          ],
      };
    expect(
      buildComposeBody(
        {
          ...withImages,
          imageAlts:
            [],
        },
      )
        .imageAlts,
    ).toBeUndefined();
    expect(
      buildComposeBody(
        {
          ...withImages,
          imageAlts:
            [
              '',
              ' cat ',
            ],
        },
      )
        .imageAlts,
    ).toEqual(
      [
        '',
        'cat',
      ],
    );
  });
  it('merges extraBody then feature fields, in that order', () => {
    const body =
      buildComposeBody(
        {
          ...baseBody,
          content:
            'x',
          extraBody:
            {
              flair:
                'a',
              content:
                'overridden',
            },
          featureFields:
            [
              {
                ttl: 1,
              },
              {
                ttl: 2,
                embed: true,
              },
            ],
        },
      );
    expect(
      body,
    ).toMatchObject(
      {
        flair:
          'a',
        content:
          'overridden',
        ttl: 2,
        embed: true,
      },
    );
  });
});

describe('buildOptimisticItem', () => {
  const input =
    {
      id: 'temp-1',
      content:
        ' hello ',
      sessionUser:
        {
          id: 'u1',
          name: 'Ana',
          image:
            '/s.png',
          handle:
            'ana',
        },
      resolvedUser:
        {
          name: 'Ana R',
          image:
            null,
          handle:
            null,
        },
      hasImages: true,
      imageUrls:
        [
          '/a',
        ],
      imageAlts:
        [
          ' alt ',
        ],
      isSensitive: false,
      isTake: false,
      replyControl:
        'EVERYONE' as const,
      hasGif: false,
      gifUrl:
        '',
      hasPoll: true,
      poll: {
        question:
          ' Q ',
        options:
          [
            'a',
            '',
            'b',
          ],
        multiSelect: false,
      },
      unlockPrice:
        '7',
    };
  it('shows the author their own pending post', () => {
    const item =
      buildOptimisticItem(
        input,
      );
    expect(
      item,
    ).toMatchObject(
      {
        id: 'temp-1',
        pending: true,
        locked: false,
        content:
          'hello',
        unlockPrice: 7,
        imageUrls:
          [
            '/a',
          ],
        imageAlts:
          [
            'alt',
          ],
        isTake:
          undefined,
      },
    );
    expect(
      item.user,
    ).toMatchObject(
      {
        id: 'u1',
        name: 'Ana R',
        image:
          '/s.png',
        handle:
          'ana',
      },
    );
    expect(
      item.poll,
    ).toEqual(
      {
        id: 'temp-1-poll',
        question:
          'Q',
        multiSelect: false,
        totalVotes: 0,
        options:
          [
            {
              id: 'temp-1-opt-0',
              text: 'a',
              voteCount: 0,
            },
            {
              id: 'temp-1-opt-1',
              text: 'b',
              voteCount: 0,
            },
          ],
      },
    );
  });
  it('omits empty media, price and content', () => {
    const item =
      buildOptimisticItem(
        {
          ...input,
          content:
            '  ',
          hasImages: false,
          hasPoll: false,
          unlockPrice:
            '',
        },
      );
    expect(
      item.content,
    ).toBeUndefined();
    expect(
      item.imageUrls,
    ).toBeUndefined();
    expect(
      item.poll,
    ).toBeUndefined();
    expect(
      item.unlockPrice,
    ).toBeUndefined();
  });
});

describe('failed-post helpers', () => {
  it('prepends failed text to a box the user already started', () => {
    expect(
      prependFailedContent(
        'old',
        '  ',
      ),
    ).toBe(
      'old',
    );
    expect(
      prependFailedContent(
        'old',
        'new',
      ),
    ).toBe(
      'old\n\nnew',
    );
  });
  it('knows when the composer is as reset left it', () => {
    const empty =
      {
        content:
          ' ',
        attachment:
          null,
        imageCount: 0,
        gifUrl:
          ' ',
        hasCodeEmbed: false,
      };
    expect(
      isComposerEmpty(
        empty,
      ),
    ).toBe(
      true,
    );
    expect(
      isComposerEmpty(
        {
          ...empty,
          content:
            'x',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isComposerEmpty(
        {
          ...empty,
          attachment:
            'poll',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isComposerEmpty(
        {
          ...empty,
          imageCount: 1,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isComposerEmpty(
        {
          ...empty,
          gifUrl:
            'u',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      isComposerEmpty(
        {
          ...empty,
          hasCodeEmbed: true,
        },
      ),
    ).toBe(
      false,
    );
  });
});

describe('list helpers', () => {
  it('appendImages caps at the limit', () => {
    expect(
      appendImages(
        [
          '1',
          '2',
          '3',
        ],
        [
          '4',
          '5',
        ],
      ),
    ).toEqual(
      [
        '1',
        '2',
        '3',
        '4',
      ],
    );
    expect(
      appendImages(
        [],
        [
          'a',
        ],
      ),
    ).toEqual(
      [
        'a',
      ],
    );
    expect(
      MAX_IMAGES,
    ).toBe(
      4,
    );
  });
  it('setAltAt pads so any index is addressable', () => {
    expect(
      setAltAt(
        [],
        2,
        'c',
      ),
    ).toEqual(
      [
        '',
        '',
        'c',
      ],
    );
    expect(
      setAltAt(
        [
          'a',
          'b',
        ],
        0,
        'z',
      ),
    ).toEqual(
      [
        'z',
        'b',
      ],
    );
  });
  it('removeAt drops one element', () => {
    expect(
      removeAt(
        [
          'a',
          'b',
          'c',
        ],
        1,
      ),
    ).toEqual(
      [
        'a',
        'c',
      ],
    );
  });
});
