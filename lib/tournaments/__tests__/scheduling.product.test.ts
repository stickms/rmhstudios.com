/** Match times and deadlines (s07-06): the pure rules. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  DEADLINE_HOURS,
  canAward,
  deadlineFor,
  deadlineNoticeDueAt,
  isDeadlineHours,
  isOverdue,
  isSchedulable,
  nextMatchFor,
  proposalProblem,
  reminderDueAt,
  schedulePhase,
  type ScheduleMatch,
} from '@/lib/tournaments/scheduling';
import {
  RESULT_SOURCES,
  sourceKind,
} from '@/lib/tournaments/match-results';
import { deadlineHoursSchema } from '@/lib/tournaments/scheduling-schema';

const NOW =
  new Date(
    '2026-12-01T12:00:00Z',
  );
const H = 3_600_000;
const open =
  (
    over: Partial<ScheduleMatch> = {},
  ): ScheduleMatch => ({
    state:
      'READY',
    entrantAId:
      'a',
    entrantBId:
      'b',
    deadlineAt:
      null,
    scheduledAt:
      null,
    claimedAt:
      null,
    ...over,
  });

describe('deadline choices', () => {
  it('are none, 24 h, 48 h, 72 h and 7 days', () => {
    expect(
      [
        ...DEADLINE_HOURS,
      ],
    ).toEqual(
      [
        24,
        48,
        72,
        168,
      ],
    );
    expect(
      isDeadlineHours(
        48,
      ),
    ).toBe(
      true,
    );
    expect(
      isDeadlineHours(
        5,
      ),
    ).toBe(
      false,
    );
    expect(
      isDeadlineHours(
        '48',
      ),
    ).toBe(
      false,
    );
  });

  it('the schema takes the listed values and null', () => {
    for (const ok of [
      24,
      48,
      72,
      168,
      null,
    ])
      expect(
        deadlineHoursSchema.safeParse(
          ok,
        )
          .success,
      ).toBe(
        true,
      );
    for (const bad of [
      0,
      12,
      100,
      '24',
      undefined,
    ])
      expect(
        deadlineHoursSchema.safeParse(
          bad,
        )
          .success,
      ).toBe(
        false,
      );
  });

  it('deadlineFor is readyAt plus hours, or null without a setting', () => {
    expect(
      deadlineFor(
        NOW,
        48,
      ),
    ).toEqual(
      new Date(
        NOW.getTime() +
          48 *
            H,
      ),
    );
    expect(
      deadlineFor(
        NOW,
        null,
      ),
    ).toBeNull();
    expect(
      deadlineFor(
        NOW,
        undefined,
      ),
    ).toBeNull();
    expect(
      deadlineFor(
        NOW,
        5,
      ),
    ).toBeNull();
  });
});

describe('overdue and award', () => {
  const deadline =
    new Date(
      NOW.getTime() +
        H,
    );
  it('a match is overdue only after its deadline, while it is open', () => {
    expect(
      isOverdue(
        open(
          {
            deadlineAt:
              deadline,
          },
        ),
        NOW,
      ),
    ).toBe(
      false,
    );
    expect(
      isOverdue(
        open(
          {
            deadlineAt:
              deadline,
          },
        ),
        new Date(
          deadline.getTime() +
            1,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      isOverdue(
        open(
          {
            deadlineAt:
              null,
          },
        ),
        NOW,
      ),
    ).toBe(
      false,
    );
    expect(
      isOverdue(
        open(
          {
            deadlineAt:
              deadline,
            state:
              'COMPLETE',
          },
        ),
        new Date(
          deadline.getTime() +
            1,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      isOverdue(
        open(
          {
            deadlineAt:
              deadline,
            state:
              'CANCELLED',
          },
        ),
        new Date(
          deadline.getTime() +
            1,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      isOverdue(
        open(
          {
            deadlineAt:
              deadline,
            entrantBId:
              null,
          },
        ),
        new Date(
          deadline.getTime() +
            1,
        ),
      ),
    ).toBe(
      false,
    );
  });

  it('an open claim blocks the award', () => {
    const late =
      new Date(
        deadline.getTime() +
          1,
      );
    expect(
      canAward(
        open(
          {
            deadlineAt:
              deadline,
          },
        ),
        late,
      ),
    ).toBe(
      true,
    );
    expect(
      canAward(
        open(
          {
            deadlineAt:
              deadline,
            claimedAt:
              NOW,
          },
        ),
        late,
      ),
    ).toBe(
      false,
    );
    expect(
      canAward(
        open(
          {
            deadlineAt:
              deadline,
          },
        ),
        NOW,
      ),
    ).toBe(
      false,
    );
  });

  it('only ready or live matches with two entrants are schedulable', () => {
    expect(
      isSchedulable(
        open(),
      ),
    ).toBe(
      true,
    );
    expect(
      isSchedulable(
        open(
          {
            state:
              'LIVE',
          },
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      isSchedulable(
        open(
          {
            state:
              'PENDING',
          },
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      isSchedulable(
        open(
          {
            state:
              'BYE',
          },
        ),
      ),
    ).toBe(
      false,
    );
  });

  it('"walkover" is a known result source', () => {
    expect(
      RESULT_SOURCES,
    ).toContain(
      'walkover',
    );
    expect(
      sourceKind(
        'walkover',
      ),
    ).toBe(
      'walkover',
    );
    expect(
      sourceKind(
        'made-up',
      ),
    ).toBeNull();
  });
});

describe('a proposed time', () => {
  const deadline =
    new Date(
      NOW.getTime() +
        48 *
          H,
    );
  it('must be ahead, before the deadline and within a year', () => {
    expect(
      proposalProblem(
        new Date(
          NOW.getTime() +
            H,
        ),
        NOW,
        deadline,
      ),
    ).toBeNull();
    expect(
      proposalProblem(
        NOW,
        NOW,
        deadline,
      ),
    ).toBe(
      'PAST',
    );
    expect(
      proposalProblem(
        new Date(
          NOW.getTime() -
            H,
        ),
        NOW,
        null,
      ),
    ).toBe(
      'PAST',
    );
    expect(
      proposalProblem(
        new Date(
          deadline.getTime() +
            1,
        ),
        NOW,
        deadline,
      ),
    ).toBe(
      'AFTER_DEADLINE',
    );
    expect(
      proposalProblem(
        deadline,
        NOW,
        deadline,
      ),
    ).toBeNull();
    expect(
      proposalProblem(
        new Date(
          NOW.getTime() +
            400 *
              24 *
              H,
        ),
        NOW,
        null,
      ),
    ).toBe(
      'TOO_FAR',
    );
    expect(
      proposalProblem(
        new Date(
          'nope',
        ),
        NOW,
        null,
      ),
    ).toBe(
      'PAST',
    );
  });

  it('reminders fall 60 minutes before the time and 12 hours before the deadline', () => {
    const t =
      new Date(
        NOW.getTime() +
          5 *
            H,
      );
    expect(
      reminderDueAt(
        t,
      ),
    ).toEqual(
      new Date(
        t.getTime() -
          H,
      ),
    );
    expect(
      reminderDueAt(
        null,
      ),
    ).toBeNull();
    expect(
      deadlineNoticeDueAt(
        t,
      ),
    ).toEqual(
      new Date(
        t.getTime() -
          12 *
            H,
      ),
    );
    expect(
      deadlineNoticeDueAt(
        null,
      ),
    ).toBeNull();
  });

  it('the row reads overdue, then scheduled, then deadline', () => {
    const d =
      new Date(
        NOW.getTime() +
          H,
      );
    expect(
      schedulePhase(
        open(
          {
            deadlineAt:
              d,
          },
        ),
        NOW,
      ),
    ).toBe(
      'deadline',
    );
    expect(
      schedulePhase(
        open(
          {
            deadlineAt:
              d,
            scheduledAt:
              d,
          },
        ),
        NOW,
      ),
    ).toBe(
      'scheduled',
    );
    expect(
      schedulePhase(
        open(
          {
            deadlineAt:
              d,
            scheduledAt:
              d,
          },
        ),
        new Date(
          d.getTime() +
            1,
        ),
      ),
    ).toBe(
      'overdue',
    );
    expect(
      schedulePhase(
        open(),
        NOW,
      ),
    ).toBe(
      'none',
    );
    expect(
      schedulePhase(
        open(
          {
            state:
              'COMPLETE',
            deadlineAt:
              d,
          },
        ),
        NOW,
      ),
    ).toBe(
      'none',
    );
  });
});

describe('your next match', () => {
  const m =
    (
      id: string,
      over: object,
    ) => ({
      id,
      state:
        'READY',
      entrantAId:
        'me',
      entrantBId:
        'x',
      scheduledAt:
        null as
          | string
          | null,
      deadlineAt:
        null as
          | string
          | null,
      round: 1,
      slot: 0,
      ...over,
    });
  it('prefers an agreed time, then the nearest deadline, and ignores others and settled matches', () => {
    const rows =
      [
        m(
          'late',
          {
            deadlineAt:
              '2026-12-05T00:00:00Z',
            round: 2,
          },
        ),
        m(
          'soon',
          {
            deadlineAt:
              '2026-12-02T00:00:00Z',
            round: 3,
          },
        ),
        m(
          'agreed',
          {
            scheduledAt:
              '2026-12-09T00:00:00Z',
            round: 4,
          },
        ),
        m(
          'theirs',
          {
            entrantAId:
              'p',
            entrantBId:
              'q',
            scheduledAt:
              '2026-12-01T13:00:00Z',
          },
        ),
        m(
          'done',
          {
            state:
              'COMPLETE',
            scheduledAt:
              '2026-12-01T13:00:00Z',
          },
        ),
      ];
    expect(
      nextMatchFor(
        rows,
        'me',
      )
        ?.id,
    ).toBe(
      'agreed',
    );
    expect(
      nextMatchFor(
        rows.filter(
          (
            r,
          ) =>
            r.id !==
            'agreed',
        ),
        'me',
      )
        ?.id,
    ).toBe(
      'soon',
    );
    expect(
      nextMatchFor(
        rows,
        null,
      ),
    ).toBeNull();
    expect(
      nextMatchFor(
        [
          rows[3]!,
        ],
        'me',
      ),
    ).toBeNull();
  });
});
