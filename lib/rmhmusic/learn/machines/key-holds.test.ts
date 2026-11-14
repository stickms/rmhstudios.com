import {
  describe,
  expect,
  it,
} from 'vitest';
import { createRunner } from './runner';
import {
  initial,
  keyHoldsMachine,
  step,
  type Effect,
  type Event,
  type State,
} from './key-holds';

const C = 60;
const D = 62;
const holding: State =
  {
    pointers:
      {
        1: C,
      },
    down: [
      1,
    ],
    focus:
      [],
  };
const lifted: State =
  {
    pointers:
      {},
    down: [
      1,
    ],
    focus:
      [],
  };
const focused: State =
  {
    pointers:
      {},
    down: [],
    focus:
      [
        C,
      ],
  };

describe('key holds: transition table', () => {
  const table: [
    string,
    State,
    Event,
    State,
    Effect[],
  ][] =
    [
      [
        'pointer-down presses',
        initial,
        {
          type: 'pointer-down',
          pointer: 1,
          midi: C,
          primary: true,
        },
        holding,
        [
          {
            type: 'press',
            midi: C,
          },
        ],
      ],
      [
        'a right/middle mouse press is ignored',
        initial,
        {
          type: 'pointer-down',
          pointer: 1,
          midi: C,
          primary: false,
        },
        initial,
        [],
      ],
      [
        'a second finger on the same key holds it without a second press',
        holding,
        {
          type: 'pointer-down',
          pointer: 2,
          midi: C,
          primary: true,
        },
        {
          pointers:
            {
              1: C,
              2: C,
            },
          down: [
            1,
            2,
          ],
          focus:
            [],
        },
        [],
      ],
      [
        'a glissando slides the held note',
        holding,
        {
          type: 'pointer-enter',
          pointer: 1,
          midi: D,
          pressed: true,
        },
        {
          pointers:
            {
              1: D,
            },
          down: [
            1,
          ],
          focus:
            [],
        },
        [
          {
            type: 'release',
            midi: C,
          },
          {
            type: 'press',
            midi: D,
          },
        ],
      ],
      [
        'entering with the button up plays nothing',
        holding,
        {
          type: 'pointer-enter',
          pointer: 1,
          midi: D,
          pressed: false,
        },
        holding,
        [],
      ],
      [
        'a pointer not pressed on the keyboard plays nothing on enter',
        initial,
        {
          type: 'pointer-enter',
          pointer: 1,
          midi: D,
          pressed: true,
        },
        initial,
        [],
      ],
      [
        'pointer-off releases',
        holding,
        {
          type: 'pointer-off',
          pointer: 1,
          midi: C,
        },
        lifted,
        [
          {
            type: 'release',
            midi: C,
          },
        ],
      ],
      [
        'pointer-off from a key it does not hold is ignored',
        holding,
        {
          type: 'pointer-off',
          pointer: 1,
          midi: D,
        },
        holding,
        [],
      ],
      [
        'releasing one of two holders keeps the note',
        {
          pointers:
            {
              1: C,
              2: C,
            },
          down: [
            1,
            2,
          ],
          focus:
            [],
        },
        {
          type: 'pointer-off',
          pointer: 2,
          midi: C,
        },
        {
          pointers:
            {
              1: C,
            },
          down: [
            1,
            2,
          ],
          focus:
            [],
        },
        [],
      ],
      [
        'pointer-lift ends the press',
        lifted,
        {
          type: 'pointer-lift',
          pointer: 1,
        },
        initial,
        [],
      ],
      [
        'pointer-exit ends the press',
        lifted,
        {
          type: 'pointer-exit',
          pointer: 1,
        },
        initial,
        [],
      ],
      [
        'Space presses',
        initial,
        {
          type: 'key-down',
          midi: C,
          key: ' ',
          repeat: false,
        },
        focused,
        [
          {
            type: 'press',
            midi: C,
          },
        ],
      ],
      [
        'Enter presses',
        initial,
        {
          type: 'key-down',
          midi: C,
          key: 'Enter',
          repeat: false,
        },
        focused,
        [
          {
            type: 'press',
            midi: C,
          },
        ],
      ],
      [
        'an auto-repeat is ignored',
        initial,
        {
          type: 'key-down',
          midi: C,
          key: ' ',
          repeat: true,
        },
        initial,
        [],
      ],
      [
        'another key does not press',
        initial,
        {
          type: 'key-down',
          midi: C,
          key: 'a',
          repeat: false,
        },
        initial,
        [],
      ],
      [
        'Space up releases',
        focused,
        {
          type: 'key-up',
          midi: C,
          key: ' ',
        },
        initial,
        [
          {
            type: 'release',
            midi: C,
          },
        ],
      ],
      [
        'a stray keyup (Tab, a letter) keeps the note held',
        focused,
        {
          type: 'key-up',
          midi: C,
          key: 'Tab',
        },
        focused,
        [],
      ],
      [
        'blur releases',
        focused,
        {
          type: 'blur',
          midi: C,
        },
        initial,
        [
          {
            type: 'release',
            midi: C,
          },
        ],
      ],
      [
        'a focus hold and a finger on one key: lifting the finger keeps it',
        {
          pointers:
            {
              1: C,
            },
          down: [
            1,
          ],
          focus:
            [
              C,
            ],
        },
        {
          type: 'pointer-off',
          pointer: 1,
          midi: C,
        },
        {
          pointers:
            {},
          down: [
            1,
          ],
          focus:
            [
              C,
            ],
        },
        [],
      ],
      [
        'release-all lets go of everything',
        {
          pointers:
            {
              1: C,
              2: D,
            },
          down: [
            1,
            2,
          ],
          focus:
            [
              64,
            ],
        },
        {
          type: 'release-all',
        },
        initial,
        [
          {
            type: 'release',
            midi: 64,
          },
          {
            type: 'release',
            midi: C,
          },
          {
            type: 'release',
            midi: D,
          },
        ],
      ],
    ];

  it.each(
    table,
  )(
    '%s',
    (
      _name,
      from,
      event,
      to,
      fx,
    ) => {
      expect(
        step(
          from,
          event,
        ),
      ).toEqual(
        {
          state:
            to,
          effects:
            fx,
        },
      );
    },
  );
});

describe('key holds: regressions (finding g)', () => {
  it('a mouse dragged off the keyboard, released outside, then dragged back on sounds nothing', () => {
    const runner =
      createRunner(
        keyHoldsMachine,
      );
    runner.send(
      {
        type: 'pointer-down',
        pointer: 1,
        midi: C,
        primary: true,
      },
    );
    runner.send(
      {
        type: 'pointer-off',
        pointer: 1,
        midi: C,
      },
    ); // leaves the key
    runner.send(
      {
        type: 'pointer-exit',
        pointer: 1,
      },
    ); // leaves the keyboard; the button comes up outside
    // Later: pressed elsewhere on the page and dragged onto a key with the button down.
    expect(
      runner.send(
        {
          type: 'pointer-enter',
          pointer: 1,
          midi: D,
          pressed: true,
        },
      ),
    ).toEqual(
      [],
    );
    expect(
      runner.get(),
    ).toEqual(
      initial,
    );
  });

  it('a stray keyup does not release a key held with Space', () => {
    const runner =
      createRunner(
        keyHoldsMachine,
      );
    runner.send(
      {
        type: 'key-down',
        midi: C,
        key: ' ',
        repeat: false,
      },
    );
    expect(
      runner.send(
        {
          type: 'key-up',
          midi: C,
          key: 'Shift',
        },
      ),
    ).toEqual(
      [],
    );
    expect(
      runner.send(
        {
          type: 'key-up',
          midi: C,
          key: ' ',
        },
      ),
    ).toEqual(
      [
        {
          type: 'release',
          midi: C,
        },
      ],
    );
  });
});
