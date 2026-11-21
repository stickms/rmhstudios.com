import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CONTEXT_ITEMS,
  collectContext,
  decodeCursor,
  editionOf,
  encodeCursor,
  firstLine,
  likePattern,
  pickContext,
  statusChangeError,
  type ContextEnv,
} from '@/lib/feedback/inbox';
import { updateFeedbackBodySchema } from '@/lib/feedback/inbox-schema';

const fakeWindow =
  (
    over: Partial<ContextEnv> = {},
    className = 'style-graphite',
    lang = 'ar',
  ): ContextEnv => ({
    location:
      {
        pathname:
          '/games/chess',
      },
    innerWidth: 390,
    innerHeight: 844,
    document:
      {
        documentElement:
          {
            lang,
            className,
          },
      },
    ...over,
  });

describe('context collection', () => {
  it('reads path, viewport, edition, locale and the last three error messages from a fake window', () => {
    const ctx =
      collectContext(
        fakeWindow(),
        [
          'one',
          'two',
          'three',
          'four',
        ],
      );
    expect(
      ctx,
    ).toEqual(
      {
        path: '/games/chess',
        viewport:
          '390x844',
        edition:
          'Night',
        locale:
          'ar',
        build:
          'current',
        errors:
          [
            'two',
            'three',
            'four',
          ],
      },
    );
  });

  it('never carries a query string or fragment, and caps error messages', () => {
    const ctx =
      collectContext(
        fakeWindow(
          {
            location:
              {
                pathname:
                  '/a?b=1#c',
              },
          },
        ),
        [
          'x'.repeat(
            500,
          ),
        ],
      );
    expect(
      ctx.path,
    ).toBe(
      '/a',
    );
    expect(
      ctx
        .errors[0],
    ).toHaveLength(
      200,
    );
  });

  it('names Day, Night and a bought theme', () => {
    expect(
      editionOf(
        '',
      ),
    ).toBe(
      'Day',
    );
    expect(
      editionOf(
        'style-default',
      ),
    ).toBe(
      'Day',
    );
    expect(
      editionOf(
        'app style-graphite',
      ),
    ).toBe(
      'Night',
    );
    expect(
      editionOf(
        'x style-aurora-9',
      ),
    ).toBe(
      'aurora-9',
    );
  });

  it('sends only ticked items, and no empty error list', () => {
    const all =
      collectContext(
        fakeWindow(),
        [],
      );
    expect(
      pickContext(
        all,
        new Set(
          [
            'path',
            'locale',
          ],
        ),
      ),
    ).toEqual(
      {
        path: '/games/chess',
        locale:
          'ar',
      },
    );
    expect(
      pickContext(
        all,
        new Set(
          CONTEXT_ITEMS,
        ),
      ),
    ).not.toHaveProperty(
      'errors',
    );
    expect(
      pickContext(
        all,
        new Set(),
      ),
    ).toEqual(
      {},
    );
  });
});

describe('status and outcome', () => {
  it('requires an outcome to close and refuses one otherwise', () => {
    expect(
      statusChangeError(
        'closed',
        undefined,
      ),
    ).toBe(
      'outcome-required',
    );
    expect(
      statusChangeError(
        'closed',
        'fixed',
      ),
    ).toBeNull();
    expect(
      statusChangeError(
        'in_progress',
        'fixed',
      ),
    ).toBe(
      'outcome-only-when-closed',
    );
    expect(
      statusChangeError(
        'new',
        undefined,
      ),
    ).toBeNull();
  });

  it('applies the same rule in the PATCH schema', () => {
    expect(
      updateFeedbackBodySchema.safeParse(
        {
          status:
            'closed',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      updateFeedbackBodySchema.safeParse(
        {
          status:
            'closed',
          outcome:
            'duplicate',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      updateFeedbackBodySchema.safeParse(
        {
          reply:
            'x'.repeat(
              1001,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      updateFeedbackBodySchema.safeParse(
        {
          adminNote:
            'x'.repeat(
              1001,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      updateFeedbackBodySchema.safeParse(
        {
          adminNote:
            '',
        },
      )
        .success,
    ).toBe(
      true,
    );
  });
});

describe('keyset cursor and text helpers', () => {
  it('round-trips (createdAt, id) and refuses anything else', () => {
    const at =
      new Date(
        '2026-11-20T10:00:00.123Z',
      );
    const c =
      encodeCursor(
        {
          createdAt:
            at,
          id: 'clx9',
        },
      );
    expect(
      decodeCursor(
        c,
      ),
    ).toEqual(
      {
        createdAt:
          at,
        id: 'clx9',
      },
    );
    for (const bad of [
      '',
      'x',
      '123',
      '_id',
      '12_',
      "12_a'b",
      '99999999999999999_a',
    ])
      expect(
        decodeCursor(
          bad,
        ),
        bad,
      ).toBeNull();
  });

  it('takes the first non-empty line and escapes LIKE wildcards', () => {
    expect(
      firstLine(
        '\n  \nHello there\nsecond',
      ),
    ).toBe(
      'Hello there',
    );
    expect(
      firstLine(
        'a'.repeat(
          300,
        ),
        10,
      ),
    ).toHaveLength(
      10,
    );
    expect(
      likePattern(
        '50%_off\\',
      ),
    ).toBe(
      '%50\\%\\_off\\\\%',
    );
  });
});
