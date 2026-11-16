import {
  describe,
  expect,
  it,
} from 'vitest';
import { createSegmenter } from './mic-segmenter';

const f =
  (
    midi: number,
  ) => ({
    midi,
    cents: 0,
  });

describe('createSegmenter', () => {
  it('emits on after 3 consecutive frames of the same note, not before', () => {
    const s =
      createSegmenter();
    expect(
      s.push(
        f(
          60,
        ),
        0,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        f(
          60,
        ),
        1,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        f(
          60,
        ),
        2,
      ),
    ).toEqual(
      [
        {
          type: 'on',
          midi: 60,
          velocity: 0.8,
          time: 2,
          source:
            'mic',
          cents: 0,
        },
      ],
    );
    // Staying on the note emits nothing further.
    expect(
      s.push(
        f(
          60,
        ),
        3,
      ),
    ).toEqual(
      [],
    );
  });

  it('emits one off after 4 consecutive null frames', () => {
    const s =
      createSegmenter();
    for (
      let i = 0;
      i <
      3;
      i++
    )
      s.push(
        f(
          60,
        ),
        i,
      );
    expect(
      s.push(
        null,
        3,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        null,
        4,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        null,
        5,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        null,
        6,
      ),
    ).toEqual(
      [
        {
          type: 'off',
          midi: 60,
          velocity: 0.8,
          time: 6,
          source:
            'mic',
        },
      ],
    );
    expect(
      s.push(
        null,
        7,
      ),
    ).toEqual(
      [],
    );
  });

  it('replaces the active note only after the new one is stable for 3 frames', () => {
    const s =
      createSegmenter();
    for (
      let i = 0;
      i <
      3;
      i++
    )
      s.push(
        f(
          60,
        ),
        i,
      );
    expect(
      s.push(
        f(
          62,
        ),
        3,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        f(
          62,
        ),
        4,
      ),
    ).toEqual(
      [],
    );
    const out =
      s.push(
        f(
          62,
        ),
        5,
      );
    expect(
      out.map(
        (
          e,
        ) => [
          e.type,
          e.midi,
        ],
      ),
    ).toEqual(
      [
        [
          'off',
          60,
        ],
        [
          'on',
          62,
        ],
      ],
    );
  });

  it('ignores a single stray frame of another note', () => {
    const s =
      createSegmenter();
    for (
      let i = 0;
      i <
      3;
      i++
    )
      s.push(
        f(
          60,
        ),
        i,
      );
    expect(
      s.push(
        f(
          61,
        ),
        3,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        f(
          60,
        ),
        4,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        f(
          60,
        ),
        5,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        f(
          60,
        ),
        6,
      ),
    ).toEqual(
      [],
    );
  });

  it('a stray frame does not defeat the release counter for the active note', () => {
    const s =
      createSegmenter();
    for (
      let i = 0;
      i <
      3;
      i++
    )
      s.push(
        f(
          60,
        ),
        i,
      );
    // A null run interrupted by the active note starts over.
    s.push(
      null,
      3,
    );
    s.push(
      null,
      4,
    );
    s.push(
      f(
        60,
      ),
      5,
    );
    expect(
      s.push(
        null,
        6,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        null,
        7,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        null,
        8,
      ),
    ).toEqual(
      [],
    );
    expect(
      s.push(
        null,
        9,
      ),
    ).toHaveLength(
      1,
    );
  });
});

describe('createSegmenter flush', () => {
  it('releases the sounding note once, and nothing when silent', () => {
    const s =
      createSegmenter();
    expect(
      s.flush(
        0,
      ),
    ).toEqual(
      [],
    );
    for (
      let i = 0;
      i <
      3;
      i++
    )
      s.push(
        f(
          60,
        ),
        i,
      );
    expect(
      s
        .flush(
          9,
        )
        .map(
          (
            e,
          ) => [
            e.type,
            e.midi,
            e.time,
          ],
        ),
    ).toEqual(
      [
        [
          'off',
          60,
          9,
        ],
      ],
    );
    expect(
      s.flush(
        10,
      ),
    ).toEqual(
      [],
    );
  });
});

describe('createSegmenter: re-attack (opt-in, the songs screen only)', () => {
  const at =
    (
      midi: number,
      rms: number,
    ) => ({
      midi,
      cents: 0,
      rms,
    });
  /** A note struck, held, let decay, then struck again on the same pitch, 25 ms frames. */
  const levels =
    [
      0.2,
      0.2,
      0.2,
      0.18,
      0.12,
      0.08,
      0.05,
      0.05,
      0.15,
      0.2,
      0.2,
    ];
  function play(
    opts?: Parameters<
      typeof createSegmenter
    >[0],
  ) {
    const s =
      createSegmenter(
        opts,
      );
    const events: {
      type: string;
      time: number;
    }[] =
      [];
    levels.forEach(
      (
        rms,
        i,
      ) => {
        for (const e of s.push(
          at(
            64,
            rms,
          ),
          i *
            25,
        ))
          events.push(
            {
              type: e.type,
              time: e.time,
            },
          );
      },
    );
    return events;
  }

  it('is off by default: a repeated note without silence stays one note (other lessons are unchanged)', () => {
    expect(
      play(),
    ).toEqual(
      [
        {
          type: 'on',
          time: 50,
        },
      ],
    );
    expect(
      play(
        {
          reattack:
            () =>
              false,
        },
      ),
    ).toEqual(
      [
        {
          type: 'on',
          time: 50,
        },
      ],
    );
  });

  it('when on, a 6 dB rise within 80 ms after the level decayed is a new note-on of the same pitch', () => {
    expect(
      play(
        {
          reattack:
            () =>
              true,
        },
      ),
    ).toEqual(
      [
        {
          type: 'on',
          time: 50,
        },
        {
          type: 'off',
          time: 200,
        },
        {
          type: 'on',
          time: 200,
        },
      ],
    );
  });

  it('never re-attacks a steady or wavering note, nor one that has not decayed', () => {
    const s =
      createSegmenter(
        {
          reattack:
            () =>
              true,
        },
      );
    const events: string[] =
      [];
    [
      0.1,
      0.1,
      0.1,
      0.12,
      0.09,
      0.12,
      0.1,
      0.13,
      0.1,
    ].forEach(
      (
        rms,
        i,
      ) => {
        for (const e of s.push(
          at(
            60,
            rms,
          ),
          i *
            25,
        ))
          events.push(
            e.type,
          );
      },
    );
    expect(
      events,
    ).toEqual(
      [
        'on',
      ],
    );
    // A frame without a level (older callers) never re-attacks.
    expect(
      s.push(
        {
          midi: 60,
          cents: 0,
        },
        300,
      ),
    ).toEqual(
      [],
    );
  });
});
