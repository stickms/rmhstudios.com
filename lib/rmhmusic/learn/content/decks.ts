/**
 * The flashcard decks and how a practice session is dealt from one — pure.
 *
 * Phase 2 drills use natural notes only (no sharps or flats), so a card is named by its letter
 * alone and no enharmonic spelling is needed. A deck lists MIDI numbers and one clef; a card is
 * one of them on that clef, and its id (`treble:64`) is stable, so a remembered card (SRS) can be
 * found again.
 */
import type { Clef } from '../theory/clef';

export interface Card {
  /** `<clef>:<midi>`, e.g. `treble:64`. Stored forever with the card's schedule. */
  id: string;
  clef: Clef;
  midi: number;
}

export interface Deck {
  id: string;
  clef: Clef;
  /** Natural notes only, lowest first. */
  midis: number[];
}

export function cardId(
  clef: Clef,
  midi: number,
): string {
  return `${clef}:${midi}`;
}

const NATURAL_PITCH_CLASSES =
  [
    0,
    2,
    4,
    5,
    7,
    9,
    11,
  ];

/** The natural notes from `low` to `high` inclusive. */
function naturals(
  low: number,
  high: number,
): number[] {
  const out: number[] =
    [];
  for (
    let m =
      low;
    m <=
    high;
    m++
  )
    if (
      NATURAL_PITCH_CLASSES.includes(
        m %
          12,
      )
    )
      out.push(
        m,
      );
  return out;
}

export const DECKS: Record<
  string,
  Deck
> =
  {
    /** E4 G4 B4 D5 F5 */
    'treble-lines':
      {
        id: 'treble-lines',
        clef: 'treble',
        midis:
          [
            64,
            67,
            71,
            74,
            77,
          ],
      },
    /** F4 A4 C5 E5 */
    'treble-spaces':
      {
        id: 'treble-spaces',
        clef: 'treble',
        midis:
          [
            65,
            69,
            72,
            76,
          ],
      },
    /** C4 to A5 */
    'treble-all':
      {
        id: 'treble-all',
        clef: 'treble',
        midis:
          naturals(
            60,
            81,
          ),
      },
    /** B3 C4 D4 and the C5 above: the note on the ledger line and the ones beside it. */
    'middle-c':
      {
        id: 'middle-c',
        clef: 'treble',
        midis:
          [
            59,
            60,
            62,
            72,
          ],
      },
    /** E2 to C4 */
    'bass-all':
      {
        id: 'bass-all',
        clef: 'bass',
        midis:
          naturals(
            40,
            60,
          ),
      },
  };

/** No session is longer than this, whatever is asked (a guard against a wild `count`). */
export const MAX_SESSION_CARDS = 200;

function toCard(
  deck: Deck,
  midi: number,
): Card {
  return {
    id: cardId(
      deck.clef,
      midi,
    ),
    clef: deck.clef,
    midi,
  };
}

/** Every card some deck deals, by id: the only ids a remembered card may have. */
const KNOWN_CARDS: ReadonlyMap<
  string,
  Card
> =
  new Map(
    Object.values(
      DECKS,
    ).flatMap(
      (
        deck,
      ) =>
        deck.midis.map(
          (
            midi,
          ) =>
            [
              cardId(
                deck.clef,
                midi,
              ),
              toCard(
                deck,
                midi,
              ),
            ] as const,
        ),
    ),
  );

/** Whether `id` names a card of one of the decks (`treble:64`), exactly as `cardId` spells it. */
export function isKnownCardId(
  id: string,
): boolean {
  return KNOWN_CARDS.has(
    id,
  );
}

/** The card `id` names, or null when no deck has it. */
export function parseCardId(
  id: string,
): Card | null {
  const card =
    KNOWN_CARDS.get(
      id,
    );
  return card
    ? {
        ...card,
      }
    : null;
}

/** Fisher-Yates, in place, with an injected `rand` clamped to [0, 1). */
// eslint-disable-next-line no-restricted-syntax -- shuffle sanitises the injected rand (NaN/1.0) and mutates in place
export function shuffle<
  T,
>(
  items: T[],
  rand: () => number,
): T[] {
  for (
    let i =
      items.length -
      1;
    i >
    0;
    i--
  ) {
    const r =
      rand();
    const unit =
      Number.isFinite(
        r,
      )
        ? Math.min(
            Math.max(
              r,
              0,
            ),
            1 -
              Number.EPSILON,
          )
        : 0;
    const j =
      Math.floor(
        unit *
          (i +
            1),
      );
    [
      items[
        i
      ],
      items[
        j
      ],
    ] =
      [
        items[
          j
        ],
        items[
          i
        ],
      ];
  }
  return items;
}

/**
 * Deal `count` values from `values`: shuffled and dealt through whole, then shuffled again, so every
 * value of a small set is dealt before any repeats; a new round never opens with the value the last
 * one ended on, so the same value never comes up twice in a row (a one-value set cannot avoid it).
 * `count` is floored and capped at MAX_SESSION_CARDS; 0 or a non-finite count gives nothing.
 */
export function dealRounds(
  values: readonly number[],
  count: number,
  rand: () => number,
): number[] {
  if (
    !Number.isFinite(
      count,
    ) ||
    values.length ===
      0
  )
    return [];
  const total =
    Math.min(
      Math.floor(
        count,
      ),
      MAX_SESSION_CARDS,
    );
  const out: number[] =
    [];
  while (
    out.length <
    total
  ) {
    const round =
      shuffle(
        [
          ...values,
        ],
        rand,
      );
    const last =
      out[
        out.length -
          1
      ];
    if (
      last !==
        undefined &&
      round.length >
        1 &&
      round[0] ===
        last
    ) {
      // Swap the opener with the next value: it was the last one dealt, so it moves to second.
      [
        round[0],
        round[1],
      ] =
        [
          round[1],
          round[0],
        ];
    }
    for (const v of round) {
      if (
        out.length >=
        total
      )
        break;
      out.push(
        v,
      );
    }
  }
  return out;
}

/** Deal `count` cards from `deck` by {@link dealRounds}: no card twice in a row. */
export function buildSession(
  deck: Deck,
  count: number,
  rand: () => number,
): Card[] {
  return dealRounds(
    deck.midis,
    count,
    rand,
  ).map(
    (
      midi,
    ) =>
      toCard(
        deck,
        midi,
      ),
  );
}
