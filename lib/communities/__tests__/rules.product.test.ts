import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  addReporter,
  removalNoticeText,
  reorderRules,
  reportDedupeKey,
  withPositions,
} from '@/lib/communities/rules';

describe('reorderRules', () => {
  const list =
    [
      'a',
      'b',
      'c',
      'd',
    ];

  it('moves an item up and down without touching the input', () => {
    expect(
      reorderRules(
        list,
        3,
        0,
      ),
    ).toEqual(
      [
        'd',
        'a',
        'b',
        'c',
      ],
    );
    expect(
      reorderRules(
        list,
        0,
        2,
      ),
    ).toEqual(
      [
        'b',
        'c',
        'a',
        'd',
      ],
    );
    expect(
      list,
    ).toEqual(
      [
        'a',
        'b',
        'c',
        'd',
      ],
    );
  });

  it('ignores a move that goes nowhere or off the list', () => {
    expect(
      reorderRules(
        list,
        1,
        1,
      ),
    ).toEqual(
      list,
    );
    expect(
      reorderRules(
        list,
        -1,
        2,
      ),
    ).toEqual(
      list,
    );
    expect(
      reorderRules(
        list,
        1,
        4,
      ),
    ).toEqual(
      list,
    );
    expect(
      reorderRules(
        list,
        9,
        0,
      ),
    ).toEqual(
      list,
    );
  });

  it('renumbers from 1 in the new order', () => {
    const moved =
      reorderRules(
        [
          {
            t: 'x',
          },
          {
            t: 'y',
          },
          {
            t: 'z',
          },
        ],
        2,
        0,
      );
    expect(
      withPositions(
        moved,
      ).map(
        (
          r,
        ) => [
          r.position,
          r.t,
        ],
      ),
    ).toEqual(
      [
        [
          1,
          'z',
        ],
        [
          2,
          'x',
        ],
        [
          3,
          'y',
        ],
      ],
    );
  });
});

describe('report dedupe', () => {
  it('is one key per member, post and rule', () => {
    const k =
      reportDedupeKey(
        'u1',
        'p1',
        'r1',
      );
    expect(
      reportDedupeKey(
        'u1',
        'p1',
        'r1',
      ),
    ).toBe(
      k,
    );
    expect(
      new Set(
        [
          k,
          reportDedupeKey(
            'u2',
            'p1',
            'r1',
          ),
          reportDedupeKey(
            'u1',
            'p2',
            'r1',
          ),
          reportDedupeKey(
            'u1',
            'p1',
            'r2',
          ),
        ],
      )
        .size,
    ).toBe(
      4,
    );
  });

  it('cannot be forged by moving a boundary between the parts', () => {
    expect(
      reportDedupeKey(
        'u1',
        'p1x',
        'r',
      ),
    ).not.toBe(
      reportDedupeKey(
        'u1x',
        'p1',
        'r',
      ),
    );
    expect(
      reportDedupeKey(
        'a:b',
        'c',
        'd',
      ),
    ).not.toBe(
      reportDedupeKey(
        'a',
        'b:c',
        'd',
      ),
    );
  });

  it('counts a reporter once', () => {
    const first =
      addReporter(
        [],
        'k1',
      );
    expect(
      first,
    ).toEqual(
      {
        keys: [
          'k1',
        ],
        added: true,
      },
    );
    const second =
      addReporter(
        first.keys,
        'k2',
      );
    expect(
      second,
    ).toEqual(
      {
        keys: [
          'k1',
          'k2',
        ],
        added: true,
      },
    );
    const repeat =
      addReporter(
        second.keys,
        'k1',
      );
    expect(
      repeat,
    ).toEqual(
      {
        keys: [
          'k1',
          'k2',
        ],
        added: false,
      },
    );
    expect(
      first.keys,
    ).toEqual(
      [
        'k1',
      ],
    );
  });
});

describe('removalNoticeText', () => {
  it('names the community, the rule number and its title', () => {
    expect(
      removalNoticeText(
        {
          communityName:
            'Chess',
          rule: {
            position: 3,
            title:
              'Be kind',
          },
        },
      ),
    ).toBe(
      'Removed from Chess for breaking rule 3: Be kind',
    );
  });

  it('says only where it was removed from when no rule is cited', () => {
    expect(
      removalNoticeText(
        {
          communityName:
            'Chess',
          rule: null,
        },
      ),
    ).toBe(
      'Removed from Chess',
    );
  });

  it('appends the moderator note', () => {
    expect(
      removalNoticeText(
        {
          communityName:
            'Chess',
          rule: {
            position: 1,
            title:
              'On topic',
          },
          message:
            '  Please check again. ',
        },
      ),
    ).toBe(
      'Removed from Chess for breaking rule 1: On topic. Please check again.',
    );
  });
});
