import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  ADD_BATCH_MAX,
  GROUP_MEMBER_CAP,
  applyCap,
  isGroupOwner,
  pickHeir,
  seatsLeft,
  splitCandidates,
} from '@/lib/group-chat/manage';
import {
  addMembersBody,
  renameGroupBody,
  transferOwnerBody,
} from '@/lib/group-chat/manage-schema';

const NOW =
  new Date(
    '2026-11-21T12:00:00Z',
  );
const user =
  (
    id: string,
    bannedUntil: Date | null = null,
  ) => ({
    id,
    bannedUntil,
  });

describe('owner and cap rules', () => {
  it('only the recorded owner owns a group', () => {
    expect(
      isGroupOwner(
        'a',
        'a',
      ),
    ).toBe(
      true,
    );
    expect(
      isGroupOwner(
        'a',
        'b',
      ),
    ).toBe(
      false,
    );
    expect(
      isGroupOwner(
        null,
        'a',
      ),
    ).toBe(
      false,
    );
  });

  it('a group holds 51 members', () => {
    expect(
      GROUP_MEMBER_CAP,
    ).toBe(
      51,
    );
    expect(
      seatsLeft(
        1,
      ),
    ).toBe(
      50,
    );
    expect(
      seatsLeft(
        50,
      ),
    ).toBe(
      1,
    );
    expect(
      seatsLeft(
        51,
      ),
    ).toBe(
      0,
    );
    expect(
      seatsLeft(
        60,
      ),
    ).toBe(
      0,
    );
  });

  it('the cap keeps the first people and refuses the rest', () => {
    expect(
      applyCap(
        [
          'a',
          'b',
          'c',
        ],
        49,
      ),
    ).toEqual(
      {
        join: [
          'a',
          'b',
        ],
        refused: 1,
      },
    );
    expect(
      applyCap(
        [
          'a',
        ],
        51,
      ),
    ).toEqual(
      {
        join: [],
        refused: 1,
      },
    );
    expect(
      applyCap(
        [],
        10,
      ),
    ).toEqual(
      {
        join: [],
        refused: 0,
      },
    );
  });
});

describe('splitCandidates', () => {
  const base =
    {
      adderId:
        'me',
      tombstoneId:
        'gone',
      now: NOW,
      blockedIds:
        new Set<string>(),
    };

  it('allows known, unblocked, unbanned people once each', () => {
    const r =
      splitCandidates(
        {
          ...base,
          requestedIds:
            [
              'a',
              'b',
              'a',
            ],
          found:
            [
              user(
                'a',
              ),
              user(
                'b',
              ),
            ],
        },
      );
    expect(
      r,
    ).toEqual(
      {
        allowed:
          [
            'a',
            'b',
          ],
        refused: 0,
      },
    );
  });

  it('refuses a block in either direction, a ban, the tombstone and the unknown', () => {
    const r =
      splitCandidates(
        {
          ...base,
          requestedIds:
            [
              'blocked',
              'banned',
              'gone',
              'nobody',
              'ok',
            ],
          found:
            [
              user(
                'blocked',
              ),
              user(
                'banned',
                new Date(
                  NOW.getTime() +
                    1000,
                ),
              ),
              user(
                'gone',
              ),
              user(
                'ok',
              ),
            ],
          blockedIds:
            new Set(
              [
                'blocked',
              ],
            ),
        },
      );
    expect(
      r,
    ).toEqual(
      {
        allowed:
          [
            'ok',
          ],
        refused: 4,
      },
    );
  });

  it('treats an expired ban as no ban and ignores the adder', () => {
    const r =
      splitCandidates(
        {
          ...base,
          requestedIds:
            [
              'me',
              'old',
            ],
          found:
            [
              user(
                'me',
              ),
              user(
                'old',
                new Date(
                  NOW.getTime() -
                    1000,
                ),
              ),
            ],
        },
      );
    expect(
      r,
    ).toEqual(
      {
        allowed:
          [
            'old',
          ],
        refused: 0,
      },
    );
  });
});

describe('pickHeir', () => {
  it('is the longest-standing remaining member, ties broken by id', () => {
    const t =
      (
        s: string,
      ) =>
        new Date(
          s,
        );
    expect(
      pickHeir(
        [
          {
            userId:
              'owner',
            joinedAt:
              t(
                '2026-01-01',
              ),
          },
          {
            userId:
              'z',
            joinedAt:
              t(
                '2026-02-01',
              ),
          },
          {
            userId:
              'b',
            joinedAt:
              t(
                '2026-03-01',
              ),
          },
        ],
        'owner',
      ),
    ).toBe(
      'z',
    );
    expect(
      pickHeir(
        [
          {
            userId:
              'y',
            joinedAt:
              t(
                '2026-02-01',
              ),
          },
          {
            userId:
              'x',
            joinedAt:
              t(
                '2026-02-01',
              ),
          },
        ],
        'owner',
      ),
    ).toBe(
      'x',
    );
    expect(
      pickHeir(
        [
          {
            userId:
              'owner',
            joinedAt:
              t(
                '2026-01-01',
              ),
          },
        ],
        'owner',
      ),
    ).toBeNull();
  });
});

describe('request schemas', () => {
  it('names are trimmed and 1 to 60 characters', () => {
    expect(
      renameGroupBody.parse(
        {
          name: '  Raid night ',
        },
      )
        .name,
    ).toBe(
      'Raid night',
    );
    expect(
      renameGroupBody.safeParse(
        {
          name: '   ',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      renameGroupBody.safeParse(
        {
          name: 'x'.repeat(
            61,
          ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      renameGroupBody.safeParse(
        {
          name: 'x'.repeat(
            60,
          ),
        },
      )
        .success,
    ).toBe(
      true,
    );
  });

  it('Add takes 1 to 10 ids or handles', () => {
    expect(
      addMembersBody.safeParse(
        {
          members:
            [],
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      addMembersBody.safeParse(
        {
          members:
            [
              'a',
            ],
        },
      )
        .success,
    ).toBe(
      true,
    );
    const many =
      Array.from(
        {
          length:
            ADD_BATCH_MAX +
            1,
        },
        (
          _,
          i,
        ) =>
          `u${i}`,
      );
    expect(
      addMembersBody.safeParse(
        {
          members:
            many,
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      addMembersBody.safeParse(
        {
          members:
            many.slice(
              0,
              ADD_BATCH_MAX,
            ),
        },
      )
        .success,
    ).toBe(
      true,
    );
  });

  it('a transfer names one user', () => {
    expect(
      transferOwnerBody.safeParse(
        {
          userId:
            'u1',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      transferOwnerBody.safeParse(
        {},
      )
        .success,
    ).toBe(
      false,
    );
  });
});
