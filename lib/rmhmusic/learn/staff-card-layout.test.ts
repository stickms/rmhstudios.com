import {
  describe,
  expect,
  it,
} from 'vitest';
import { DECKS } from './content/decks';
import {
  findNotePool,
  targetStaff,
} from './machines/find-note';
import {
  CARD_H,
  CARD_LOW_H,
  CARD_LOW_MIN_STEP,
  CARD_MAX_STEP,
  CARD_MIN_STEP,
  CARD_W,
  CLEF_GLYPHS,
  HEAD_RX,
  cardLayout,
  cardY,
} from './staff-card-layout';
import { clefStep } from './theory/clef';

/** Every number in an SVG path string. */
const coords =
  (
    d: string,
  ) =>
    (
      d.match(
        /-?\d+(\.\d+)?/g,
      ) ??
      []
    ).map(
      Number,
    );

describe('flashcard staff layout', () => {
  it('fits every card of every deck inside the fixed box, unclamped', () => {
    for (const deck of Object.values(
      DECKS,
    )) {
      for (const midi of deck.midis) {
        const raw =
          clefStep(
            deck.clef,
            midi,
          );
        expect(
          raw,
          `${deck.id}:${midi}`,
        ).toBeGreaterThanOrEqual(
          CARD_MIN_STEP,
        );
        expect(
          raw,
          `${deck.id}:${midi}`,
        ).toBeLessThanOrEqual(
          CARD_MAX_STEP,
        );
        const l =
          cardLayout(
            deck.clef,
            midi,
          );
        expect(
          l.step,
        ).toBe(
          raw,
        );
        for (const y of [
          l.noteY -
            HEAD_RX,
          l.noteY +
            HEAD_RX,
          l
            .stem
            .y1,
          l
            .stem
            .y2,
          ...l.ledgerYs,
        ]) {
          expect(
            y,
          ).toBeGreaterThan(
            0,
          );
          expect(
            y,
          ).toBeLessThan(
            CARD_H,
          );
        }
      }
    }
  });

  it('fits every note-finder target on the low card, unclamped, on both instruments', () => {
    for (const mode of [
      'keyboard-map',
      'fretboard',
    ] as const) {
      for (const instrument of [
        'piano',
        'guitar',
      ] as const) {
        for (const sounding of findNotePool(
          mode,
          instrument,
        )) {
          const {
            clef,
            midi,
          } =
            targetStaff(
              sounding,
              instrument,
            );
          const raw =
            clefStep(
              clef,
              midi,
            );
          expect(
            raw,
            `${instrument}:${sounding}`,
          ).toBeGreaterThanOrEqual(
            CARD_LOW_MIN_STEP,
          );
          expect(
            raw,
            `${instrument}:${sounding}`,
          ).toBeLessThanOrEqual(
            CARD_MAX_STEP,
          );
          const l =
            cardLayout(
              clef,
              midi,
              CARD_LOW_MIN_STEP,
            );
          expect(
            l.step,
          ).toBe(
            raw,
          );
          for (const y of [
            l.noteY -
              HEAD_RX,
            l.noteY +
              HEAD_RX,
            l
              .stem
              .y2,
            ...l.ledgerYs,
          ]) {
            expect(
              y,
            ).toBeGreaterThan(
              0,
            );
            expect(
              y,
            ).toBeLessThan(
              CARD_LOW_H,
            );
          }
        }
      }
    }
  });

  it('writes the open low E (written E3) under three ledger lines of the treble staff', () => {
    const l =
      cardLayout(
        'treble',
        52,
        CARD_LOW_MIN_STEP,
      );
    expect(
      l.step,
    ).toBe(
      -7,
    );
    expect(
      l.ledgerYs,
    ).toEqual(
      [
        cardY(
          -2,
        ),
        cardY(
          -4,
        ),
        cardY(
          -6,
        ),
      ],
    );
    // The deck card would have clamped it to two ledger lines: the low card is needed.
    expect(
      cardLayout(
        'treble',
        52,
      )
        .step,
    ).toBe(
      CARD_MIN_STEP,
    );
  });

  it('puts middle C on one ledger line below the treble staff and above the bass staff', () => {
    const treble =
      cardLayout(
        'treble',
        60,
      );
    expect(
      treble.step,
    ).toBe(
      -2,
    );
    expect(
      treble.ledgerYs,
    ).toEqual(
      [
        cardY(
          -2,
        ),
      ],
    );
    const bass =
      cardLayout(
        'bass',
        60,
      );
    expect(
      bass.step,
    ).toBe(
      10,
    );
    expect(
      bass.ledgerYs,
    ).toEqual(
      [
        cardY(
          10,
        ),
      ],
    );
    // B3 hangs below the ledger line without needing another.
    expect(
      cardLayout(
        'treble',
        59,
      )
        .ledgerYs,
    ).toEqual(
      [
        cardY(
          -2,
        ),
      ],
    );
  });

  it('stems up below the middle line and down from it', () => {
    const e4 =
      cardLayout(
        'treble',
        64,
      );
    expect(
      e4
        .stem
        .y2,
    ).toBeLessThan(
      e4.noteY,
    );
    const b4 =
      cardLayout(
        'treble',
        71,
      );
    expect(
      b4
        .stem
        .y2,
    ).toBeGreaterThan(
      b4.noteY,
    );
  });

  it('draws both clefs inside the box', () => {
    for (const glyph of Object.values(
      CLEF_GLYPHS,
    )) {
      const n =
        coords(
          glyph.path,
        );
      expect(
        n.length,
      ).toBeGreaterThan(
        20,
      );
      for (
        let i = 0;
        i <
        n.length;
        i += 2
      ) {
        expect(
          n[
            i
          ],
        ).toBeGreaterThan(
          0,
        );
        expect(
          n[
            i
          ],
        ).toBeLessThan(
          CARD_W,
        );
        expect(
          n[
            i +
              1
          ],
        ).toBeGreaterThan(
          0,
        );
        expect(
          n[
            i +
              1
          ],
        ).toBeLessThan(
          CARD_H,
        );
      }
    }
  });
});
