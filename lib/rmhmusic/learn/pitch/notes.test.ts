import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  centsBetween,
  freqToMidi,
  midiToFreq,
  midiToName,
  nameToMidi,
  nearestNote,
} from './notes';

describe('note maths', () => {
  it('maps A4 = 440 Hz to MIDI 69 and back', () => {
    expect(
      freqToMidi(
        440,
      ),
    ).toBe(
      69,
    );
    expect(
      midiToFreq(
        69,
      ),
    ).toBe(
      440,
    );
  });

  it('names MIDI notes with sharps or flats', () => {
    expect(
      midiToName(
        60,
      ),
    ).toBe(
      'C4',
    );
    expect(
      midiToName(
        61,
        {
          flats: true,
        },
      ),
    ).toBe(
      'Db4',
    );
  });

  it('parses note names and rejects invalid ones', () => {
    expect(
      nameToMidi(
        'Db4',
      ),
    ).toBe(
      61,
    );
    expect(
      nameToMidi(
        'H9',
      ),
    ).toBeNull();
  });

  it('finds the nearest note and the cents offset', () => {
    const low =
      nearestNote(
        82.41,
      );
    expect(
      low.name,
    ).toBe(
      'E2',
    );
    expect(
      Math.abs(
        low.cents,
      ),
    ).toBeLessThan(
      1,
    );

    const sharp =
      nearestNote(
        450,
      );
    expect(
      sharp.name,
    ).toBe(
      'A4',
    );
    expect(
      sharp.cents,
    ).toBeCloseTo(
      38.9,
      1,
    );
  });

  it('measures cents between two frequencies', () => {
    expect(
      centsBetween(
        440,
        880,
      ),
    ).toBe(
      1200,
    );
  });
});
