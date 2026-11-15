import {
  describe,
  expect,
  it,
} from 'vitest';
import { parseBars } from './notation';
import {
  notesOf,
  phraseAt,
  songBeats,
  soundingPitch,
  type Song,
} from './score';

function song(
  over: Partial<Song> & {
    src: string;
  },
): Song {
  return {
    id: 'test',
    title:
      'Test',
    composer:
      'Traditional',
    key: 'C',
    beatsPerBar: 4,
    bpm: 90,
    pickup: 0,
    bars: parseBars(
      over.src,
    ),
    ...over,
  };
}

describe('notesOf', () => {
  it('numbers every note, with its bar and its onset in beats from the start', () => {
    const notes =
      notesOf(
        song(
          {
            src: 'C4 D4 E4:2 | G4:0.5 A4:0.5 G4:3 |',
          },
        ),
      );
    expect(
      notes.map(
        (
          n,
        ) => [
          n.index,
          n.bar,
          n.onset,
        ],
      ),
    ).toEqual(
      [
        [
          0,
          0,
          0,
        ],
        [
          1,
          0,
          1,
        ],
        [
          2,
          0,
          2,
        ],
        [
          3,
          1,
          4,
        ],
        [
          4,
          1,
          4.5,
        ],
        [
          5,
          1,
          5,
        ],
      ],
    );
    expect(
      notes[2]
        ?.written,
    ).toBe(
      64,
    );
  });

  it('starts a pickup at beat 0 and the first full bar after it', () => {
    const notes =
      notesOf(
        song(
          {
            beatsPerBar: 3,
            pickup: 1,
            src: 'D4 | G4:2 B4 |',
          },
        ),
      );
    expect(
      notes.map(
        (
          n,
        ) =>
          n.onset,
      ),
    ).toEqual(
      [
        0,
        1,
        3,
      ],
    );
    expect(
      songBeats(
        song(
          {
            beatsPerBar: 3,
            pickup: 1,
            src: 'D4 | G4:2 B4 |',
          },
        ),
      ),
    ).toBe(
      4,
    );
  });

  it('prints no accidental for a note the key signature already sharpens', () => {
    const notes =
      notesOf(
        song(
          {
            key: 'G',
            src: 'F#4 G4 F4 F4 |',
          },
        ),
      );
    expect(
      notes.map(
        (
          n,
        ) =>
          n.printed,
      ),
    ).toEqual(
      [
        null,
        null,
        'natural',
        null,
      ],
    );
  });

  it('prints an accidental once per bar and again in the next bar', () => {
    const notes =
      notesOf(
        song(
          {
            src: 'C#4 C#4 D4 C4 | C#4 D4:3 |',
          },
        ),
      );
    expect(
      notes.map(
        (
          n,
        ) =>
          n.printed,
      ),
    ).toEqual(
      [
        'sharp',
        null,
        null,
        'natural',
        'sharp',
        null,
      ],
    );
  });

  it('prints a flat in C and none for B flat in F', () => {
    expect(
      notesOf(
        song(
          {
            src: 'Bb4:4 |',
          },
        ),
      )[0]
        ?.printed,
    ).toBe(
      'flat',
    );
    expect(
      notesOf(
        song(
          {
            key: 'F',
            src: 'Bb4:4 |',
          },
        ),
      )[0]
        ?.printed,
    ).toBeNull();
  });
});

describe('soundingPitch', () => {
  it('plays piano as written and guitar an octave lower (the small 8 under the clef)', () => {
    expect(
      soundingPitch(
        64,
        'piano',
      ),
    ).toBe(
      64,
    );
    expect(
      soundingPitch(
        64,
        'guitar',
      ),
    ).toBe(
      52,
    );
  });
});

describe('phraseAt', () => {
  const twelve =
    song(
      {
        src: 'C4:4 | D4:4 | E4:4 | F4:4 | G4 G4 G4 G4 | A4:4 | B4:4 | C5:4 | D5:4 |',
      },
    );

  it('is the four bars the note is in', () => {
    expect(
      phraseAt(
        twelve,
        0,
      ),
    ).toEqual(
      {
        from: 0,
        to: 4,
      },
    );
    expect(
      phraseAt(
        twelve,
        3,
      ),
    ).toEqual(
      {
        from: 0,
        to: 4,
      },
    );
    expect(
      phraseAt(
        twelve,
        4,
      ),
    ).toEqual(
      {
        from: 4,
        to: 11,
      },
    );
    expect(
      phraseAt(
        twelve,
        7,
      ),
    ).toEqual(
      {
        from: 4,
        to: 11,
      },
    );
    expect(
      phraseAt(
        twelve,
        11,
      ),
    ).toEqual(
      {
        from: 11,
        to: 12,
      },
    );
  });

  it('counts the pickup with the first phrase', () => {
    const picked =
      song(
        {
          pickup: 1,
          src: 'G3 | C4:4 | C4:4 | C4:4 | C4:4 | D4:4 |',
        },
      );
    expect(
      phraseAt(
        picked,
        0,
      ),
    ).toEqual(
      {
        from: 0,
        to: 5,
      },
    );
    expect(
      phraseAt(
        picked,
        5,
      ),
    ).toEqual(
      {
        from: 5,
        to: 6,
      },
    );
  });

  it('clamps an index past either end', () => {
    expect(
      phraseAt(
        twelve,
        -3,
      ),
    ).toEqual(
      {
        from: 0,
        to: 4,
      },
    );
    expect(
      phraseAt(
        twelve,
        99,
      ),
    ).toEqual(
      {
        from: 11,
        to: 12,
      },
    );
  });
});
