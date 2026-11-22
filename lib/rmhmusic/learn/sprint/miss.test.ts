import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  promptMidis,
  type SprintPrompt,
} from './generate';
import {
  sprintMiss,
  writtenNoteOf,
  writtenShift,
} from './miss';

const note =
  (
    written: number,
    accidental:
      | -1
      | 0
      | 1 = 0,
    extra: Partial<SprintPrompt> = {},
  ): SprintPrompt => ({
    level:
      accidental ===
      0
        ? 'note'
        : 'accidental',
    kind:
      accidental ===
      0
        ? 'note'
        : 'accidental',
    clef: 'treble',
    notes:
      [
        {
          written,
          accidental,
        },
      ],
    ...extra,
  });
const view =
  (
    p: SprintPrompt,
    played: number[],
    exact: boolean,
    instrument:
      | 'piano'
      | 'guitar'
      | 'voice' = 'piano',
  ) =>
    sprintMiss(
      {
        prompt:
          p,
        targets:
          promptMidis(
            p,
            instrument,
          ),
        played,
        instrument,
        exact,
      },
    );

describe('writtenNoteOf', () => {
  it('writes a white key on its line and a black key as a sharp below', () => {
    expect(
      writtenNoteOf(
        64,
        0,
      ),
    ).toEqual(
      {
        written: 64,
        accidental: 0,
      },
    );
    expect(
      writtenNoteOf(
        66,
        0,
      ),
    ).toEqual(
      {
        written: 65,
        accidental: 1,
      },
    );
    expect(
      writtenNoteOf(
        52,
        12,
      ),
    ).toEqual(
      {
        written: 64,
        accidental: 0,
      },
    ); // a guitar's sounding E3
  });
});

describe('sprintMiss — one note', () => {
  it('counts the steps between the written notes and says which way', () => {
    const v =
      view(
        note(
          60,
        ),
        [
          64,
        ],
        true,
      )!; // C4 asked, E4 played
    expect(
      v.heads,
    ).toEqual(
      [
        {
          written: 64,
          accidental: 0,
        },
      ],
    );
    expect(
      v.facts,
    ).toMatchObject(
      {
        type: 'note',
        played:
          'E4',
        wanted:
          'C4',
        steps: 2,
        direction:
          'above',
        exact: true,
      },
    );
  });

  it('names no octave for an input that does not play one, and draws the nearest', () => {
    const v =
      view(
        note(
          60,
        ),
        [
          76,
        ],
        false,
      )!; // mic heard E5, but only the letter counted
    expect(
      v.heads,
    ).toEqual(
      [
        {
          written: 64,
          accidental: 0,
        },
      ],
    );
    expect(
      v.facts,
    ).toMatchObject(
      {
        played:
          'E',
        wanted:
          'C',
        steps: 2,
        direction:
          'above',
        exact: false,
      },
    );
  });

  it('calls the right letter an octave away an octave on a MIDI keyboard', () => {
    const v =
      view(
        note(
          60,
        ),
        [
          72,
        ],
        true,
      )!;
    expect(
      v.facts,
    ).toMatchObject(
      {
        steps: 7,
        direction:
          'above',
        octaves: true,
      },
    );
  });

  it('is level with the right line when only the accidental is wrong', () => {
    const flat =
      view(
        note(
          64,
          -1,
        ),
        [
          64,
        ],
        true,
      )!; // E♭ asked, E played
    expect(
      flat.facts,
    ).toMatchObject(
      {
        steps: 0,
        direction:
          'level',
        wanted:
          'E♭4',
        played:
          'E4',
      },
    );
    const sharpForNatural =
      view(
        note(
          60,
        ),
        [
          61,
        ],
        true,
      )!; // C asked, C♯ played
    expect(
      sharpForNatural.facts,
    ).toMatchObject(
      {
        steps: 0,
        direction:
          'level',
      },
    );
  });

  it('moves a played pitch back to the page for guitar and tenor music', () => {
    const p =
      note(
        64,
      );
    expect(
      writtenShift(
        p,
        'guitar',
      ),
    ).toBe(
      12,
    );
    // Written E4 sounds E3 (52) on guitar; a D3 (50) sounds a step below it.
    const v =
      view(
        p,
        [
          50,
        ],
        true,
        'guitar',
      )!;
    expect(
      v.heads,
    ).toEqual(
      [
        {
          written: 62,
          accidental: 0,
        },
      ],
    );
    expect(
      v.facts,
    ).toMatchObject(
      {
        steps: 1,
        direction:
          'below',
        played:
          'D3',
        wanted:
          'E3',
      },
    );
    const tenor =
      note(
        64,
        0,
        {
          octaveClef: true,
        },
      );
    expect(
      writtenShift(
        tenor,
        'voice',
      ),
    ).toBe(
      12,
    );
    expect(
      view(
        tenor,
        [
          50,
        ],
        true,
        'voice',
      )!
        .facts,
    ).toMatchObject(
      {
        steps: 1,
        direction:
          'below',
      },
    ); // a tenor's D3
  });
});

describe('sprintMiss — bar and chord', () => {
  it('shows the wrong note of a bar against the note that was due, beside that note', () => {
    const bar: SprintPrompt =
      {
        level:
          'bar',
        kind: 'bar',
        clef: 'treble',
        notes:
          [
            64,
            65,
            67,
            69,
          ].map(
            (
              written,
            ) => ({
              written,
              accidental:
                0 as const,
            }),
          ),
      };
    const v =
      view(
        bar,
        [
          64,
          65,
          71,
        ],
        true,
      )!; // E, F right; then B where G was due
    expect(
      v.heads,
    ).toEqual(
      [
        {
          written: 71,
          accidental: 0,
        },
      ],
    );
    expect(
      v.facts,
    ).toMatchObject(
      {
        played:
          'B4',
        wanted:
          'G4',
        steps: 2,
        direction:
          'above',
      },
    );
    expect(
      v.dx,
    ).toBeLessThan(
      0,
    );
  });

  it('lists the notes played against the chord asked', () => {
    const triad: SprintPrompt =
      {
        level:
          'triad',
        kind: 'chord',
        clef: 'treble',
        notes:
          [
            {
              written: 60,
              accidental: 0,
            },
            {
              written: 64,
              accidental:
                -1,
            },
            {
              written: 67,
              accidental: 0,
            },
          ],
      };
    const v =
      view(
        triad,
        [
          60,
          64,
          67,
        ],
        true,
      )!;
    expect(
      v.heads,
    ).toHaveLength(
      3,
    );
    expect(
      v.facts,
    ).toEqual(
      {
        type: 'chord',
        played:
          [
            'C',
            'E',
            'G',
          ],
        wanted:
          [
            'C',
            'E♭',
            'G',
          ],
      },
    );
  });

  it('draws nothing when nothing was played', () => {
    expect(
      view(
        note(
          60,
        ),
        [],
        true,
      ),
    ).toBeNull();
  });
});
