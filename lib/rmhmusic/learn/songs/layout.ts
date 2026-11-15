/**
 * Where everything on a song's score goes — pure, so the drawing is checked without a DOM.
 *
 * **Systems.** The score is a column of systems (lines of music). Each system is drawn in the same
 * coordinates as a flashcard's staff (`staff-card-layout.ts`: top line at `CARD_TOP`, a space of
 * `CARD_GAP`), shifted down by its `top`, so the card's hand-ruled lines, clefs, sharps, flats and
 * now mark are reused as they are. A system's height is FIXED per version — `SYSTEM_H.piano` for
 * the staff alone, `SYSTEM_H.guitar` with the tab staff under it — and the page shows the score in
 * a window of `WINDOW_H` (three piano systems, two guitar systems), so the box never changes
 * height whatever the width, the song or the state.
 *
 * **Wrapping.** Each bar's width is a fixed lead plus room for its accidentals plus a width per
 * note that grows with its length. A system takes as many WHOLE bars as fit the width after its
 * header (clef, key signature and, on the first system, the time signature); its notes' spacing is
 * then stretched so its last bar line meets the right edge — except a last system that is less than
 * {@link JUSTIFY_LAST} full, which keeps its natural spacing. A bar wider than a whole system on its
 * own (a very narrow screen) is squeezed to fit.
 *
 * **Notes.** A head on the natural it is written on; a stem up below the middle line and down
 * from it (three and a half spaces); two eighths in one beat share a flat beam, a lone eighth has a
 * flag; a dot sits in the space right of the head; ledger lines as on a card. Guitar adds the tab:
 * six lines, the high E on top, and each note's fret on its string (`fingering.ts`).
 */
import {
  CARD_GAP,
  CARD_TOP,
  HEAD_RX,
  cardY,
} from '../staff-card-layout';
import {
  clefStep,
  ledgerSteps,
} from '../theory/clef';
import { fingerFor } from './fingering';
import {
  KEY_SIGNATURES,
  naturalOf,
  notesOf,
  soundingPitch,
  type Song,
  type SongVersion,
} from './score';

/** CSS pixels per layout unit: the score is drawn at this fixed scale (staff space 11 px). */
export const UNIT_PX = 1.1;
/** A system's height (units): the staff, or the staff and the tab. */
export const SYSTEM_H: Readonly<
  Record<
    SongVersion,
    number
  >
> =
  {
    piano: 108,
    guitar: 162,
  };
/** The score window's height (units): three piano systems, two guitar systems. */
export const WINDOW_H = 324;
export const STAFF_TOP =
  CARD_TOP;
export const STAFF_BOTTOM =
  CARD_TOP +
  4 *
    CARD_GAP;
/** The tab staff's top line (the high E string) and its spacing. */
export const TAB_TOP = 114;
export const TAB_GAP = 8;
/** The now mark's tip, and the centre of the pencil marks over notes that have passed. */
export const NOW_Y = 17;
export const MARK_Y = 10;
/** The last system is justified only when its bars fill at least this much of the width. */
export const JUSTIFY_LAST = 0.7;

const EDGE = 4;
const STEM =
  3.5 *
  CARD_GAP;
const BAR_LEAD = 10;
const ACC_W = 11;
const CLEF_W = 38;
const KEY_ACC_W = 9;
const TIME_W = 18;
const MIN_SQUEEZE = 0.5;
const LEDGER_HALF = 11;
/** Extra room after a lone eighth, so its flag clears the next head. */
const FLAG_W = 8;

/** How much room a note of this many beats takes after its head (units). */
export function noteWidth(
  beats: number,
): number {
  return (
    12 +
    12 *
      beats
  );
}

export interface LaidNote {
  index: number;
  bar: number;
  written: number;
  x: number;
  y: number;
  step: number;
  /** A filled head (a quarter or an eighth); an open one for a half or a whole. */
  filled: boolean;
  stem: {
    x: number;
    y1: number;
    y2: number;
  } | null;
  /** A lone eighth's flag, at its stem's end. */
  flag: boolean;
  dot: {
    x: number;
    y: number;
  } | null;
  accidental: {
    x: number;
    y: number;
    kind:
      | 'sharp'
      | 'flat'
      | 'natural';
  } | null;
  ledgers: {
    y: number;
    x0: number;
    x1: number;
  }[];
  /** Guitar: the string (0 = low E … 5 = high E), the fret and the tab line's y. */
  tab: {
    string: number;
    fret: number;
    y: number;
  } | null;
}

export interface LaidSystem {
  index: number;
  /** The system's top edge in the score (units); everything else is in system coordinates. */
  top: number;
  firstBar: number;
  lastBar: number;
  /** Where the header (clef, key and time signature) ends. */
  headerEnd: number;
  keySig: {
    x: number;
    y: number;
    kind:
      | 'sharp'
      | 'flat';
  }[];
  timeSig: {
    x: number;
    beats: number;
    unit: number;
  } | null;
  /** The x of every bar's closing bar line. */
  barLines: number[];
  /** The song's last system: its last bar line is the final double bar. */
  final: boolean;
  /** The staff's (and tab's) right end. */
  right: number;
  notes: LaidNote[];
  beams: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[];
}

export interface ScoreLayout {
  version: SongVersion;
  width: number;
  systems: LaidSystem[];
  /** Every note's system, by note index. */
  systemOf: number[];
  height: number;
}

interface BarPlan {
  bar: number;
  notes: ReturnType<
    typeof notesOf
  >;
  fixed: number;
  flex: number;
}

function headerWidth(
  song: Song,
  first: boolean,
): number {
  const keys =
    Object.keys(
      KEY_SIGNATURES[
        song
          .key
      ],
    ).length;
  return (
    CLEF_W +
    keys *
      KEY_ACC_W +
    (first
      ? TIME_W
      : 0)
  );
}

/** The y of the key signature's sharp (F) or flat (B) on the treble staff. */
const KEY_SIG_STEP =
  {
    F: 8,
    B: 4,
  } as const;

/**
 * Eighths: two in one beat of one bar share a beam (`pairs` holds the first's index); any other
 * eighth is lone and takes a flag.
 */
function eighths(
  song: Song,
  all: ReturnType<
    typeof notesOf
  >,
): {
  pairs: Set<number>;
  lone: Set<number>;
} {
  const pairs =
    new Set<number>();
  const lone =
    new Set<number>();
  const beatOf =
    (
      n: (typeof all)[number],
    ) =>
      Math.floor(
        n.onset -
          barStart(
            song,
            n.bar,
          ) +
          1e-9,
      );
  for (
    let i = 0;
    i <
    all.length;
    i++
  ) {
    const a =
      all[
        i
      ];
    if (
      !a ||
      a.beats !==
        0.5
    )
      continue;
    const b =
      all[
        i +
          1
      ];
    if (
      b &&
      b.beats ===
        0.5 &&
      b.bar ===
        a.bar &&
      beatOf(
        a,
      ) ===
        beatOf(
          b,
        )
    ) {
      pairs.add(
        i,
      );
      i++;
    } else
      lone.add(
        i,
      );
  }
  return {
    pairs,
    lone,
  };
}

export function scoreLayout(
  song: Song,
  version: SongVersion,
  width: number,
): ScoreLayout {
  const all =
    notesOf(
      song,
    );
  const {
    pairs,
    lone,
  } =
    eighths(
      song,
      all,
    );
  const roomOf =
    (
      n: (typeof all)[number],
    ) =>
      noteWidth(
        n.beats,
      ) +
      (lone.has(
        n.index,
      )
        ? FLAG_W
        : 0);
  const bars: BarPlan[] =
    song.bars.map(
      (
        _,
        b,
      ) => {
        const notes =
          all.filter(
            (
              n,
            ) =>
              n.bar ===
              b,
          );
        const acc =
          notes.filter(
            (
              n,
            ) =>
              n.printed !==
              null,
          ).length;
        return {
          bar: b,
          notes,
          fixed:
            BAR_LEAD +
            acc *
              ACC_W,
          flex: notes.reduce(
            (
              sum,
              n,
            ) =>
              sum +
              roomOf(
                n,
              ),
            0,
          ),
        };
      },
    );
  const right =
    Math.max(
      EDGE +
        1,
      width -
        EDGE,
    );

  // Greedy: whole bars while they fit at their natural width.
  const groups: BarPlan[][] =
    [];
  let current: BarPlan[] =
    [];
  let used = 0;
  for (const plan of bars) {
    const start =
      EDGE +
      headerWidth(
        song,
        groups.length ===
          0,
      );
    const need =
      plan.fixed +
      plan.flex;
    if (
      current.length >
        0 &&
      start +
        used +
        need >
        right
    ) {
      groups.push(
        current,
      );
      current =
        [];
      used = 0;
    }
    current.push(
      plan,
    );
    used +=
      need;
  }
  if (
    current.length >
    0
  )
    groups.push(
      current,
    );

  const h =
    SYSTEM_H[
      version
    ];
  const systemOf: number[] =
    [];
  const systems =
    groups.map(
      (
        group,
        s,
      ): LaidSystem => {
        const first =
          s ===
          0;
        const last =
          s ===
          groups.length -
            1;
        const keyEntries =
          Object.entries(
            KEY_SIGNATURES[
              song
                .key
            ],
          ) as [
            keyof typeof KEY_SIG_STEP,
            (
              | -1
              | 1
            ),
          ][];
        const keySig =
          keyEntries.map(
            (
              [
                letter,
                alter,
              ],
              i,
            ) => ({
              x:
                EDGE +
                CLEF_W +
                i *
                  KEY_ACC_W +
                KEY_ACC_W /
                  2,
              y: cardY(
                KEY_SIG_STEP[
                  letter
                ],
              ),
              kind:
                alter >
                0
                  ? ('sharp' as const)
                  : ('flat' as const),
            }),
          );
        const headerEnd =
          EDGE +
          headerWidth(
            song,
            first,
          );
        const timeSig =
          first
            ? {
                x:
                  headerEnd -
                  TIME_W /
                    2,
                beats:
                  song.beatsPerBar,
                unit: 4,
              }
            : null;
        const fixed =
          group.reduce(
            (
              sum,
              p,
            ) =>
              sum +
              p.fixed,
            0,
          );
        const flex =
          group.reduce(
            (
              sum,
              p,
            ) =>
              sum +
              p.flex,
            0,
          );
        const room =
          right -
          headerEnd -
          fixed;
        const fill =
          (fixed +
            flex) /
          (right -
            headerEnd);
        const justify =
          !last ||
          fill >=
            JUSTIFY_LAST;
        let stretch =
          flex >
          0
            ? room /
              flex
            : 1;
        if (
          !justify
        )
          stretch =
            Math.min(
              stretch,
              1,
            );
        stretch =
          Math.max(
            MIN_SQUEEZE,
            stretch,
          );

        const notes: LaidNote[] =
          [];
        const barLines: number[] =
          [];
        let x =
          headerEnd;
        for (const plan of group) {
          x +=
            BAR_LEAD;
          for (const n of plan.notes) {
            if (
              n.printed !==
              null
            )
              x +=
                ACC_W;
            const headX =
              x +
              HEAD_RX +
              1;
            const step =
              clefStep(
                'treble',
                naturalOf(
                  n,
                ),
              );
            const y =
              cardY(
                step,
              );
            const filled =
              n.beats <
              2;
            const whole =
              n.beats >=
              4;
            const up =
              step <
              4;
            const stem =
              whole
                ? null
                : up
                  ? {
                      x:
                        headX +
                        HEAD_RX -
                        0.6,
                      y1:
                        y -
                        1,
                      y2:
                        y -
                        STEM,
                    }
                  : {
                      x:
                        headX -
                        HEAD_RX +
                        0.6,
                      y1:
                        y +
                        1,
                      y2:
                        y +
                        STEM,
                    };
            const dotted =
              n.beats ===
                1.5 ||
              n.beats ===
                3;
            const fret =
              version ===
              'guitar'
                ? fingerFor(
                    soundingPitch(
                      n.written,
                      'guitar',
                    ),
                  )
                : null;
            notes.push(
              {
                index:
                  n.index,
                bar: n.bar,
                written:
                  n.written,
                x: headX,
                y,
                step,
                filled,
                stem,
                flag: false,
                dot: dotted
                  ? {
                      x:
                        headX +
                        HEAD_RX +
                        3.5,
                      y:
                        step %
                          2 ===
                        0
                          ? y -
                            CARD_GAP /
                              2
                          : y,
                    }
                  : null,
                accidental:
                  n.printed ===
                  null
                    ? null
                    : {
                        x:
                          headX -
                          HEAD_RX -
                          6,
                        y,
                        kind: n.printed,
                      },
                ledgers:
                  ledgerSteps(
                    step,
                  ).map(
                    (
                      ls,
                    ) => ({
                      y: cardY(
                        ls,
                      ),
                      x0:
                        headX -
                        LEDGER_HALF,
                      x1:
                        headX +
                        LEDGER_HALF,
                    }),
                  ),
                tab: fret
                  ? {
                      string:
                        fret.string,
                      fret: fret.fret,
                      y:
                        TAB_TOP +
                        (5 -
                          fret.string) *
                          TAB_GAP,
                    }
                  : null,
              },
            );
            systemOf[
              n.index
            ] =
              s;
            x +=
              roomOf(
                n,
              ) *
              stretch;
          }
          barLines.push(
            Math.min(
              right,
              x,
            ),
          );
        }
        // A justified (or squeezed) system's last bar line sits exactly on the edge, whatever the rounding.
        if (
          justify ||
          stretch <
            1
        )
          barLines[
            barLines.length -
              1
          ] =
            right;

        // Eighths: two in one beat share a beam; a lone one takes a flag.
        const beams: LaidSystem['beams'] =
          [];
        for (
          let i = 0;
          i <
          notes.length;
          i++
        ) {
          const a =
            notes[
              i
            ];
          if (
            !a
          )
            continue;
          if (
            lone.has(
              a.index,
            )
          ) {
            a.flag = true;
            continue;
          }
          const b =
            notes[
              i +
                1
            ];
          if (
            pairs.has(
              a.index,
            ) &&
            b &&
            a.stem &&
            b.stem
          ) {
            const up =
              (a.step +
                b.step) /
                2 <
              4;
            const sa =
              stemOf(
                a.x,
                a.y,
                up,
              );
            const sb =
              stemOf(
                b.x,
                b.y,
                up,
              );
            const beamY =
              up
                ? Math.min(
                    sa.y2,
                    sb.y2,
                  )
                : Math.max(
                    sa.y2,
                    sb.y2,
                  );
            a.stem =
              {
                ...sa,
                y2: beamY,
              };
            b.stem =
              {
                ...sb,
                y2: beamY,
              };
            beams.push(
              {
                x1: sa.x,
                y1: beamY,
                x2: sb.x,
                y2: beamY,
              },
            );
            i++;
          }
        }

        return {
          index:
            s,
          top:
            s *
            h,
          firstBar:
            group[0]
              ?.bar ??
            0,
          lastBar:
            group[
              group.length -
                1
            ]
              ?.bar ??
            0,
          headerEnd,
          keySig,
          timeSig,
          barLines,
          final:
            last,
          right:
            barLines[
              barLines.length -
                1
            ] ??
            right,
          notes,
          beams,
        };
      },
    );

  return {
    version,
    width,
    systems,
    systemOf,
    height:
      systems.length *
      h,
  };
}

function stemOf(
  x: number,
  y: number,
  up: boolean,
) {
  return up
    ? {
        x:
          x +
          HEAD_RX -
          0.6,
        y1:
          y -
          1,
        y2:
          y -
          STEM,
      }
    : {
        x:
          x -
          HEAD_RX +
          0.6,
        y1:
          y +
          1,
        y2:
          y +
          STEM,
      };
}

/** The onset (beats) of a bar's first beat; a pickup bar starts before beat 0 of the first full bar. */
function barStart(
  song: Song,
  bar: number,
): number {
  if (
    song.pickup >
    0
  )
    return bar ===
      0
      ? song.pickup -
          song.beatsPerBar
      : song.pickup +
          (bar -
            1) *
            song.beatsPerBar;
  return (
    bar *
    song.beatsPerBar
  );
}

/** A pencilled natural sign centred on (x, y). */
export function naturalPath(
  x: number,
  y: number,
): string {
  const f =
    (
      n: number,
    ) =>
      Number(
        n.toFixed(
          2,
        ),
      );
  return [
    `M ${f(x - 2.4)} ${f(y - 9)} L ${f(x - 2.4)} ${f(y + 4)}`,
    `M ${f(x + 2.4)} ${f(y - 4)} L ${f(x + 2.4)} ${f(y + 9)}`,
    `M ${f(x - 2.4)} ${f(y - 2)} L ${f(x + 2.4)} ${f(y - 4)}`,
    `M ${f(x - 2.4)} ${f(y + 4)} L ${f(x + 2.4)} ${f(y + 2)}`,
  ].join(
    ' ',
  );
}

/** A lone eighth's flag from its stem's end (x, y), curling away from the head. */
export function flagPath(
  x: number,
  y: number,
  up: boolean,
): string {
  const f =
    (
      n: number,
    ) =>
      Number(
        n.toFixed(
          2,
        ),
      );
  const d =
    up
      ? 1
      : -1;
  return `M ${f(x)} ${f(y)} C ${f(x + 1)} ${f(y + 7 * d)} ${f(x + 9)} ${f(y + 9 * d)} ${f(x + 6)} ${f(y + 18 * d)}`;
}

/** A pencil tick (right) or cross (wrong) centred on (x, y). */
export function markPath(
  x: number,
  y: number,
  right: boolean,
): string {
  const f =
    (
      n: number,
    ) =>
      Number(
        n.toFixed(
          2,
        ),
      );
  return right
    ? `M ${f(x - 4)} ${f(y)} L ${f(x - 1)} ${f(y + 3.5)} L ${f(x + 4.5)} ${f(y - 4)}`
    : `M ${f(x - 3.5)} ${f(y - 3.5)} L ${f(x + 3.5)} ${f(y + 3.5)} M ${f(x + 3.5)} ${f(y - 3.5)} L ${f(x - 3.5)} ${f(y + 3.5)}`;
}
