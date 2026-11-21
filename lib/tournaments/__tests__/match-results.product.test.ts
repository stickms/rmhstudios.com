import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CLAIM_WINDOW_MS,
  autoSettleDecision,
  canAnswerClaim,
  canDecide,
  canWithdrawClaim,
  claimCutoff,
  claimExpired,
  claimMinutesLeft,
  matchPhase,
  reportOutcome,
  sourceKind,
  wouldCompleteTournament,
  type ClaimState,
  type CompletionInput,
} from '@/lib/tournaments/match-results';
import {
  decideResultSchema,
  disputeResultSchema,
} from '@/lib/tournaments/match-results-schema';

const T0 =
  new Date(
    '2026-12-01T12:00:00.000Z',
  );
const open: ClaimState =
  {
    claimedWinnerId:
      null,
    claimedById:
      null,
    claimedAt:
      null,
    disputedAt:
      null,
  };
const claimed: ClaimState =
  {
    claimedWinnerId:
      'eA',
    claimedById:
      'uA',
    claimedAt:
      T0,
    disputedAt:
      null,
  };
const disputed: ClaimState =
  {
    ...claimed,
    disputedAt:
      T0,
  };

describe('the window', () => {
  it('is 15 minutes and expires exactly at the boundary', () => {
    expect(
      CLAIM_WINDOW_MS,
    ).toBe(
      15 *
        60_000,
    );
    expect(
      claimExpired(
        T0,
        new Date(
          T0.getTime() +
            CLAIM_WINDOW_MS -
            1,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      claimExpired(
        T0,
        new Date(
          T0.getTime() +
            CLAIM_WINDOW_MS,
        ),
      ),
    ).toBe(
      true,
    );
  });
  it('rounds the minutes left up and stops at 0', () => {
    expect(
      claimMinutesLeft(
        T0,
        new Date(
          T0.getTime() +
            30_000,
        ),
      ),
    ).toBe(
      15,
    );
    expect(
      claimMinutesLeft(
        T0,
        new Date(
          T0.getTime() +
            60_000,
        ),
      ),
    ).toBe(
      14,
    );
    expect(
      claimMinutesLeft(
        T0,
        new Date(
          T0.getTime() +
            CLAIM_WINDOW_MS,
        ),
      ),
    ).toBe(
      0,
    );
    expect(
      claimMinutesLeft(
        T0,
        new Date(
          T0.getTime() +
            2 *
              CLAIM_WINDOW_MS,
        ),
      ),
    ).toBe(
      0,
    );
  });
  it('the cutoff is the window before now', () => {
    expect(
      claimCutoff(
        new Date(
          T0.getTime() +
            CLAIM_WINDOW_MS,
        ),
      ).getTime(),
    ).toBe(
      T0.getTime(),
    );
  });
});

describe('transitions', () => {
  it.each(
    [
      [
        'no claim',
        open,
        'uA',
        'eA',
        'claim',
      ],
      [
        'claimant repeats',
        claimed,
        'uA',
        'eA',
        'unchanged',
      ],
      [
        'claimant changes their mind',
        claimed,
        'uA',
        'eB',
        'replace',
      ],
      [
        'opponent reports the same winner',
        claimed,
        'uB',
        'eA',
        'confirm',
      ],
      [
        'opponent reports the other winner',
        claimed,
        'uB',
        'eB',
        'dispute',
      ],
      [
        'disputed: anyone',
        disputed,
        'uB',
        'eA',
        'locked',
      ],
      [
        'erased claimant, same winner',
        {
          ...claimed,
          claimedById:
            null,
        },
        'uB',
        'eA',
        'confirm',
      ],
    ] as const,
  )(
    '%s',
    (
      _name,
      state,
      who,
      winner,
      expected,
    ) => {
      expect(
        reportOutcome(
          state,
          who,
          winner,
        ),
      ).toBe(
        expected,
      );
    },
  );

  it('only the other participant answers; only the claimant withdraws, before an answer', () => {
    expect(
      canAnswerClaim(
        claimed,
        'uB',
        [
          'uA',
          'uB',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      canAnswerClaim(
        claimed,
        'uA',
        [
          'uA',
          'uB',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      canAnswerClaim(
        claimed,
        'uC',
        [
          'uA',
          'uB',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      canAnswerClaim(
        disputed,
        'uB',
        [
          'uA',
          'uB',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      canAnswerClaim(
        open,
        'uB',
        [
          'uA',
          'uB',
        ],
      ),
    ).toBe(
      false,
    );
    expect(
      canWithdrawClaim(
        claimed,
        'uA',
      ),
    ).toBe(
      true,
    );
    expect(
      canWithdrawClaim(
        claimed,
        'uB',
      ),
    ).toBe(
      false,
    );
    expect(
      canWithdrawClaim(
        disputed,
        'uA',
      ),
    ).toBe(
      false,
    );
    expect(
      canDecide(
        true,
        false,
      ),
    ).toBe(
      true,
    );
    expect(
      canDecide(
        false,
        true,
      ),
    ).toBe(
      true,
    );
    expect(
      canDecide(
        false,
        false,
      ),
    ).toBe(
      false,
    );
  });

  it('names the phase', () => {
    expect(
      matchPhase(
        open,
      ),
    ).toBe(
      'open',
    );
    expect(
      matchPhase(
        claimed,
      ),
    ).toBe(
      'claimed',
    );
    expect(
      matchPhase(
        disputed,
      ),
    ).toBe(
      'disputed',
    );
  });
});

describe('what would complete the tournament', () => {
  const base: CompletionInput =
    {
      format:
        'SINGLE_ELIM',
      bracket:
        'W',
      round: 1,
      hasNextMatch: true,
      swissRounds:
        null,
      otherOpenMatches: 3,
    };
  it('single elimination: only the final', () => {
    expect(
      wouldCompleteTournament(
        base,
      ),
    ).toBe(
      false,
    );
    expect(
      wouldCompleteTournament(
        {
          ...base,
          hasNextMatch: false,
        },
      ),
    ).toBe(
      true,
    );
  });
  it('double elimination: the grand final and its reset, never the rest', () => {
    const d =
      {
        ...base,
        format:
          'DOUBLE_ELIM' as const,
      };
    expect(
      wouldCompleteTournament(
        {
          ...d,
          bracket:
            'W',
          hasNextMatch: false,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      wouldCompleteTournament(
        {
          ...d,
          bracket:
            'L',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      wouldCompleteTournament(
        {
          ...d,
          bracket:
            'GF',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      wouldCompleteTournament(
        {
          ...d,
          bracket:
            'GR',
        },
      ),
    ).toBe(
      true,
    );
  });
  it('round robin: the last undecided match', () => {
    const r =
      {
        ...base,
        format:
          'ROUND_ROBIN' as const,
      };
    expect(
      wouldCompleteTournament(
        r,
      ),
    ).toBe(
      false,
    );
    expect(
      wouldCompleteTournament(
        {
          ...r,
          otherOpenMatches: 0,
        },
      ),
    ).toBe(
      true,
    );
  });
  it('swiss: the last undecided match of the last round', () => {
    const s =
      {
        ...base,
        format:
          'SWISS' as const,
        swissRounds: 4,
        round: 4,
        otherOpenMatches: 0,
      };
    expect(
      wouldCompleteTournament(
        s,
      ),
    ).toBe(
      true,
    );
    expect(
      wouldCompleteTournament(
        {
          ...s,
          otherOpenMatches: 1,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      wouldCompleteTournament(
        {
          ...s,
          round: 3,
        },
      ),
    ).toBe(
      false,
    );
  });
});

describe('the job decision', () => {
  const later =
    new Date(
      T0.getTime() +
        CLAIM_WINDOW_MS,
    );
  const mid: CompletionInput =
    {
      format:
        'SINGLE_ELIM',
      bracket:
        'W',
      round: 1,
      hasNextMatch: true,
      swissRounds:
        null,
      otherOpenMatches: 1,
    };
  it('settles an expired claim, waits on a finishing one, skips the rest', () => {
    expect(
      autoSettleDecision(
        claimed,
        mid,
        later,
      ),
    ).toBe(
      'settle',
    );
    expect(
      autoSettleDecision(
        claimed,
        {
          ...mid,
          hasNextMatch: false,
        },
        later,
      ),
    ).toBe(
      'wait',
    );
    expect(
      autoSettleDecision(
        claimed,
        mid,
        new Date(
          later.getTime() -
            1,
        ),
      ),
    ).toBe(
      'skip',
    );
    expect(
      autoSettleDecision(
        disputed,
        mid,
        later,
      ),
    ).toBe(
      'skip',
    );
    expect(
      autoSettleDecision(
        open,
        mid,
        later,
      ),
    ).toBe(
      'skip',
    );
  });
});

describe('sources and schemas', () => {
  it('knows the four sources', () => {
    expect(
      sourceKind(
        'agreement',
      ),
    ).toBe(
      'agreement',
    );
    expect(
      sourceKind(
        'admin',
      ),
    ).toBe(
      'admin',
    );
    expect(
      sourceKind(
        'authoritative',
      ),
    ).toBe(
      'authoritative',
    );
    expect(
      sourceKind(
        'unanswered',
      ),
    ).toBe(
      'unanswered',
    );
    expect(
      sourceKind(
        'bye',
      ),
    ).toBeNull();
    expect(
      sourceKind(
        null,
      ),
    ).toBeNull();
  });
  it('limits the note to 300 characters and trims it', () => {
    expect(
      disputeResultSchema.safeParse(
        {
          note: 'x'.repeat(
            300,
          ),
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      disputeResultSchema.safeParse(
        {
          note: 'x'.repeat(
            301,
          ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      disputeResultSchema.parse(
        {
          note: '   ',
        },
      )
        .note,
    ).toBeUndefined();
    expect(
      disputeResultSchema.parse(
        {},
      )
        .note,
    ).toBeUndefined();
    expect(
      decideResultSchema.safeParse(
        {
          note: 'x',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      decideResultSchema.parse(
        {
          winnerEntrantId:
            'eA',
          note: ' hi ',
        },
      ),
    ).toEqual(
      {
        winnerEntrantId:
          'eA',
        note: 'hi',
      },
    );
  });
});
