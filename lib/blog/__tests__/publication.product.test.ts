import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  MAX_SCHEDULE_AHEAD_MS,
  MIN_SCHEDULE_LEAD_MS,
  filterLogs,
  formatUtcMinute,
  isLogStatus,
  publishedLogWhere,
  resolveTransition,
  revisionChanged,
  validateSchedule,
  wordCount,
} from '@/lib/blog/publication';

const NOW =
  new Date(
    '2026-11-23T10:00:00.000Z',
  );
const at =
  (
    ms: number,
  ) =>
    new Date(
      NOW.getTime() +
        ms,
    ).toISOString();

describe('validateSchedule', () => {
  it('accepts a time 5 minutes ahead and up to a year ahead', () => {
    const exact =
      validateSchedule(
        at(
          MIN_SCHEDULE_LEAD_MS,
        ),
        NOW,
      );
    expect(
      exact,
    ).toEqual(
      {
        ok: true,
        at: new Date(
          at(
            MIN_SCHEDULE_LEAD_MS,
          ),
        ),
      },
    );
    expect(
      validateSchedule(
        at(
          MAX_SCHEDULE_AHEAD_MS,
        ),
        NOW,
      )
        .ok,
    ).toBe(
      true,
    );
  });

  it('refuses a time under 5 minutes ahead, in the past included', () => {
    expect(
      validateSchedule(
        at(
          MIN_SCHEDULE_LEAD_MS -
            1,
        ),
        NOW,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          'too-soon',
      },
    );
    expect(
      validateSchedule(
        at(
          -60_000,
        ),
        NOW,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          'too-soon',
      },
    );
  });

  it('refuses a time more than a year ahead', () => {
    expect(
      validateSchedule(
        at(
          MAX_SCHEDULE_AHEAD_MS +
            1,
        ),
        NOW,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          'too-far',
      },
    );
  });

  it('refuses nothing, empty and unparseable input', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'tomorrow',
      '2026-13-45T00:00:00Z',
    ]) {
      expect(
        validateSchedule(
          bad,
          NOW,
        ),
      ).toEqual(
        {
          ok: false,
          reason:
            'invalid',
        },
      );
    }
  });
});

describe('resolveTransition', () => {
  it('a draft keeps no time and no publication date, even if it was live', () => {
    const t =
      resolveTransition(
        {
          status:
            'published',
          publishedAt:
            NOW,
        },
        'draft',
        at(
          3_600_000,
        ),
        NOW,
      );
    expect(
      t,
    ).toEqual(
      {
        ok: true,
        columns:
          {
            status:
              'draft',
            publishAt:
              null,
            publishedAt:
              null,
          },
        becamePublished: false,
      },
    );
  });

  it('scheduling stores the time and no publication date', () => {
    const t =
      resolveTransition(
        null,
        'scheduled',
        at(
          3_600_000,
        ),
        NOW,
      );
    expect(
      t,
    ).toEqual(
      {
        ok: true,
        columns:
          {
            status:
              'scheduled',
            publishAt:
              new Date(
                at(
                  3_600_000,
                ),
              ),
            publishedAt:
              null,
          },
        becamePublished: false,
      },
    );
  });

  it('rescheduling a scheduled Log is allowed; scheduling a live one is not', () => {
    expect(
      resolveTransition(
        {
          status:
            'scheduled',
          publishedAt:
            null,
        },
        'scheduled',
        at(
          3_600_000,
        ),
        NOW,
      )
        .ok,
    ).toBe(
      true,
    );
    expect(
      resolveTransition(
        {
          status:
            'published',
          publishedAt:
            NOW,
        },
        'scheduled',
        at(
          3_600_000,
        ),
        NOW,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          'already-published',
      },
    );
  });

  it('scheduling reports why a bad time failed', () => {
    expect(
      resolveTransition(
        null,
        'scheduled',
        null,
        NOW,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          'invalid-schedule',
      },
    );
    expect(
      resolveTransition(
        null,
        'scheduled',
        at(
          1000,
        ),
        NOW,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          'too-soon',
      },
    );
    expect(
      resolveTransition(
        null,
        'scheduled',
        at(
          MAX_SCHEDULE_AHEAD_MS +
            1,
        ),
        NOW,
      ),
    ).toEqual(
      {
        ok: false,
        reason:
          'too-far',
      },
    );
  });

  it('publishing a draft or scheduled Log stamps now and starts the announcement clock', () => {
    for (const status of [
      'draft',
      'scheduled',
    ] as const) {
      const t =
        resolveTransition(
          {
            status,
            publishedAt:
              null,
          },
          'published',
          null,
          NOW,
        );
      expect(
        t,
      ).toEqual(
        {
          ok: true,
          columns:
            {
              status:
                'published',
              publishAt:
                null,
              publishedAt:
                NOW,
            },
          becamePublished: true,
        },
      );
    }
    expect(
      resolveTransition(
        null,
        'published',
        null,
        NOW,
      ),
    ).toMatchObject(
      {
        becamePublished: true,
      },
    );
  });

  it('updating a live Log keeps its publication date and is not a new publication', () => {
    const was =
      new Date(
        '2026-01-02T03:04:05.000Z',
      );
    expect(
      resolveTransition(
        {
          status:
            'published',
          publishedAt:
            was,
        },
        'published',
        null,
        NOW,
      ),
    ).toEqual(
      {
        ok: true,
        columns:
          {
            status:
              'published',
            publishAt:
              null,
            publishedAt:
              was,
          },
        becamePublished: false,
      },
    );
  });
});

describe('publishedLogWhere', () => {
  it('is live Logs published by now', () => {
    expect(
      publishedLogWhere(
        NOW,
      ),
    ).toEqual(
      {
        status:
          'published',
        publishedAt:
          {
            lte: NOW,
          },
      },
    );
  });
});

describe('small helpers', () => {
  it('knows the three statuses', () => {
    expect(
      [
        'draft',
        'scheduled',
        'published',
      ].every(
        isLogStatus,
      ),
    ).toBe(
      true,
    );
    expect(
      isLogStatus(
        'archived',
      ),
    ).toBe(
      false,
    );
    expect(
      isLogStatus(
        undefined,
      ),
    ).toBe(
      false,
    );
  });

  it('counts words', () => {
    expect(
      wordCount(
        '',
      ),
    ).toBe(
      0,
    );
    expect(
      wordCount(
        '  one  two\nthree ',
      ),
    ).toBe(
      3,
    );
  });

  it('a revision is due only when title, description, tags or content change', () => {
    const base =
      {
        title:
          'T',
        description:
          'D',
        tags: [
          'a',
          'b',
        ],
        content:
          'C',
      };
    expect(
      revisionChanged(
        base,
        {
          ...base,
          tags: [
            'a',
            'b',
          ],
        },
      ),
    ).toBe(
      false,
    );
    expect(
      revisionChanged(
        base,
        {
          ...base,
          title:
            'T2',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      revisionChanged(
        base,
        {
          ...base,
          description:
            'D2',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      revisionChanged(
        base,
        {
          ...base,
          content:
            'C2',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      revisionChanged(
        base,
        {
          ...base,
          tags: [
            'b',
            'a',
          ],
        },
      ),
    ).toBe(
      true,
    );
    expect(
      revisionChanged(
        base,
        {
          ...base,
          tags: [
            'a',
          ],
        },
      ),
    ).toBe(
      true,
    );
  });

  it('formats an instant in UTC the same everywhere', () => {
    expect(
      formatUtcMinute(
        '2026-11-23T10:05:59.000Z',
      ),
    ).toBe(
      '2026-11-23 10:05',
    );
    expect(
      formatUtcMinute(
        'nope',
      ),
    ).toBe(
      '',
    );
  });

  it('filters the admin list by status', () => {
    const rows =
      [
        {
          id: 1,
          status:
            'draft' as const,
        },
        {
          id: 2,
          status:
            'scheduled' as const,
        },
        {
          id: 3,
          status:
            'published' as const,
        },
        {
          id: 4,
          status:
            'draft' as const,
        },
      ];
    expect(
      filterLogs(
        rows,
        'all',
      ).map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        1,
        2,
        3,
        4,
      ],
    );
    expect(
      filterLogs(
        rows,
        'draft',
      ).map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        1,
        4,
      ],
    );
    expect(
      filterLogs(
        rows,
        'scheduled',
      ).map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        2,
      ],
    );
    expect(
      filterLogs(
        rows,
        'published',
      ).map(
        (
          r,
        ) =>
          r.id,
      ),
    ).toEqual(
      [
        3,
      ],
    );
  });
});
