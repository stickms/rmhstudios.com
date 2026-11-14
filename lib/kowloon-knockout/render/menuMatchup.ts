// Who fights in the menu. Prefers two different Source characters (never the Y-Bot unless
// nothing else is published), rotating deterministically through the available roster so
// the pairing changes without randomness (testable, same on every render).
import { DEFAULT_FIGHTER_MODEL } from './fighter/models';

export function pickMatchup(
  available: readonly string[],
  round: number,
  previous?: readonly [
    string,
    string,
  ],
): [
  string,
  string,
] {
  const source =
    available.filter(
      (
        id,
      ) =>
        id !==
        DEFAULT_FIGHTER_MODEL,
    );
  if (
    source.length ===
    0
  )
    return [
      DEFAULT_FIGHTER_MODEL,
      DEFAULT_FIGHTER_MODEL,
    ];
  if (
    source.length ===
    1
  )
    return [
      source[0],
      DEFAULT_FIGHTER_MODEL,
    ];
  // Golden-ratio stride visits every pair-start before repeating and avoids neighbours in the list.
  const stride =
    Math.max(
      1,
      Math.round(
        source.length *
          0.618,
      ),
    );
  let i =
    (round *
      stride) %
    source.length;
  let j =
    (i +
      Math.max(
        1,
        Math.floor(
          source.length /
            2,
        ),
      ) +
      (round %
        3)) %
    source.length;
  if (
    j ===
    i
  )
    j =
      (i +
        1) %
      source.length;
  let pair: [
    string,
    string,
  ] =
    [
      source[
        i
      ],
      source[
        j
      ],
    ];
  if (
    previous &&
    pair[0] ===
      previous[0] &&
    pair[1] ===
      previous[1]
  ) {
    i =
      (i +
        1) %
      source.length;
    j =
      (j +
        1) %
        source.length ===
      i
        ? (j +
            2) %
          source.length
        : (j +
            1) %
          source.length;
    pair =
      [
        source[
          i
        ],
        source[
          j
        ],
      ];
  }
  return pair;
}
