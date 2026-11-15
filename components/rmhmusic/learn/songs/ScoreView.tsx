/**
 * ScoreView — a song's score in its fixed window (`.rmm-score`): systems that wrap to the measured
 * width (`lib/rmhmusic/learn/songs/layout.ts`), drawn in the flashcard's hand-ruled staff, with the
 * tab staff under each system for guitar.
 *
 * The window is one height for every width, version and state (three piano or two guitar
 * systems), so the page never moves; before the width is known (the server render, the first
 * client render) it is the empty window, and the score appears in the layout effect, before the
 * browser paints. It scrolls itself to keep the cursor's system at the top (and the learner may
 * scroll it to look ahead). Nothing here runs on its own: React renders when the cursor or a mark
 * changes, which the input hub and the metronome's timers cause; the width is read on mount and by
 * a ResizeObserver.
 *
 * Over the notes: the now mark (a pencilled caret) over the note to play, that note in accent ink,
 * and a pencil tick or a red-pencil cross over each note once it has passed. All SVG text is
 * `direction="ltr"` (the score reads left to right in every language).
 */
import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CARD_GAP,
  CLEF_GLYPHS,
  HEAD_RX,
  HEAD_RY,
  flatPath,
  nowMarkPath,
  ruledLine,
  sharpPath,
} from '@/lib/rmhmusic/learn/staff-card-layout';
import {
  MARK_Y,
  NOW_Y,
  STAFF_BOTTOM,
  STAFF_TOP,
  TAB_GAP,
  TAB_TOP,
  UNIT_PX,
  flagPath,
  markPath,
  naturalPath,
  scoreLayout,
  type LaidNote,
  type LaidSystem,
  type ScoreLayout,
} from '@/lib/rmhmusic/learn/songs/layout';
import type {
  Song,
  SongVersion,
} from '@/lib/rmhmusic/learn/songs/score';

export type NoteMark =
  | 'right'
  | 'wrong'
  | null;

export function ScoreView({
  song,
  version,
  cursor,
  marks,
  label,
}: {
  song: Song;
  version: SongVersion;
  /** The note to play (or the latest due), −1 for none. */
  cursor: number;
  marks: readonly NoteMark[];
  /** The image's name: the song and how it is written, in words. */
  label: string;
}) {
  const box =
    useRef<HTMLDivElement>(
      null,
    );
  const [
    width,
    setWidth,
  ] =
    useState<
      | number
      | null
    >(
      null,
    );

  useLayoutEffect(() => {
    const el =
      box.current;
    if (
      !el
    )
      return;
    const read =
      () => {
        const units =
          Math.floor(
            el.clientWidth /
              UNIT_PX,
          );
        setWidth(
          (
            w,
          ) =>
            w ===
            units
              ? w
              : units,
        );
      };
    read();
    if (
      typeof ResizeObserver ===
      'undefined'
    )
      return;
    const ro =
      new ResizeObserver(
        read,
      );
    ro.observe(
      el,
    );
    return () =>
      ro.disconnect();
  }, []);

  const layout =
    useMemo(
      () =>
        width ===
        null
          ? null
          : scoreLayout(
              song,
              version,
              width,
            ),
      [
        song,
        version,
        width,
      ],
    );

  // Keep the cursor's system at the top of the window.
  const system =
    layout &&
    cursor >=
      0
      ? (layout
          .systemOf[
          cursor
        ] ??
        0)
      : 0;
  useLayoutEffect(() => {
    const el =
      box.current;
    if (
      !el ||
      !layout
    )
      return;
    const top =
      (layout
        .systems[
        system
      ]
        ?.top ??
        0) *
      UNIT_PX;
    if (
      Math.abs(
        el.scrollTop -
          top,
      ) >
      1
    )
      el.scrollTo(
        {
          top,
          behavior:
            cursor <=
            0
              ? 'auto'
              : 'smooth',
        },
      );
  }, [
    layout,
    system,
    cursor,
  ]);

  return (
    <div
      ref={
        box
      }
      className="rmm-score"
      // A scrolling region is reachable by keyboard (axe: scrollable-region-focusable).
      tabIndex={
        0
      }
      role="group"
      aria-label={
        label
      }
    >
      {layout ? (
        <svg
          width={
            layout.width *
            UNIT_PX
          }
          height={
            layout.height *
            UNIT_PX
          }
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          aria-hidden="true"
          className="block text-app-text"
        >
          <StaticScore
            layout={
              layout
            }
            version={
              version
            }
          />
          <Overlay
            layout={
              layout
            }
            cursor={
              cursor
            }
            marks={
              marks
            }
          />
        </svg>
      ) : null}
    </div>
  );
}

/** Everything that never changes during a run: staves, clefs, signatures, bar lines, notes, tab. */
const StaticScore =
  memo(
    function StaticScore({
      layout,
      version,
    }: {
      layout: ScoreLayout;
      version: SongVersion;
    }) {
      return (
        <>
          {layout.systems.map(
            (
              sys,
            ) => (
              <g
                key={
                  sys.index
                }
                transform={`translate(0 ${sys.top})`}
              >
                <SystemRuling
                  sys={
                    sys
                  }
                  version={
                    version
                  }
                />
                <g
                  stroke="currentColor"
                  fill="currentColor"
                  strokeLinecap="round"
                >
                  {sys.notes.map(
                    (
                      n,
                    ) => (
                      <NoteGlyph
                        key={
                          n.index
                        }
                        n={
                          n
                        }
                      />
                    ),
                  )}
                  {sys.beams.map(
                    (
                      b,
                    ) => (
                      <line
                        key={`${b.x1}-${b.y1}`}
                        x1={
                          b.x1
                        }
                        y1={
                          b.y1
                        }
                        x2={
                          b.x2
                        }
                        y2={
                          b.y2
                        }
                        strokeWidth="4"
                        strokeLinecap="butt"
                      />
                    ),
                  )}
                </g>
                {version ===
                'guitar' ? (
                  <g
                    fill="currentColor"
                    stroke="none"
                    fontSize="10"
                    textAnchor="middle"
                    direction="ltr"
                    className="rmm-tab-fret"
                  >
                    {sys.notes.map(
                      (
                        n,
                      ) =>
                        n.tab ? (
                          <text
                            key={
                              n.index
                            }
                            x={
                              n.x
                            }
                            y={
                              n
                                .tab
                                .y +
                              3.5
                            }
                          >
                            {
                              n
                                .tab
                                .fret
                            }
                          </text>
                        ) : null,
                    )}
                  </g>
                ) : null}
              </g>
            ),
          )}
        </>
      );
    },
  );

function SystemRuling({
  sys,
  version,
}: {
  sys: LaidSystem;
  version: SongVersion;
}) {
  const glyph =
    CLEF_GLYPHS.treble;
  const left = 4;
  const right =
    sys.right;
  const tabBottom =
    TAB_TOP +
    5 *
      TAB_GAP;
  return (
    <>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.6"
      >
        {[
          0,
          1,
          2,
          3,
          4,
        ].map(
          (
            i,
          ) => (
            <path
              key={
                i
              }
              d={ruledLine(
                i,
                left,
                right,
              )}
            />
          ),
        )}
        <path
          d={`M ${left + 0.2} ${STAFF_TOP - 0.3} L ${left - 0.2} ${STAFF_BOTTOM + 0.3}`}
        />
        {version ===
        'guitar' ? (
          <>
            {[
              0,
              1,
              2,
              3,
              4,
              5,
            ].map(
              (
                i,
              ) => (
                <path
                  key={`t${i}`}
                  d={`M ${left} ${TAB_TOP + i * TAB_GAP} L ${right} ${TAB_TOP + i * TAB_GAP + (i % 2 ? 0.3 : -0.2)}`}
                />
              ),
            )}
            <path
              d={`M ${left} ${TAB_TOP} L ${left} ${tabBottom}`}
            />
          </>
        ) : null}
      </g>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
      >
        {sys.barLines.map(
          (
            x,
            i,
          ) => {
            const last =
              sys.final &&
              i ===
                sys
                  .barLines
                  .length -
                  1;
            const spans: [
              number,
              number,
            ][] =
              [
                [
                  STAFF_TOP,
                  STAFF_BOTTOM,
                ],
              ];
            if (
              version ===
              'guitar'
            )
              spans.push(
                [
                  TAB_TOP,
                  tabBottom,
                ],
              );
            return spans.map(
              ([
                y1,
                y2,
              ]) =>
                last ? (
                  <g
                    key={`${x}-${y1}`}
                  >
                    <line
                      x1={
                        x -
                        5
                      }
                      x2={
                        x -
                        5
                      }
                      y1={
                        y1
                      }
                      y2={
                        y2
                      }
                    />
                    <line
                      x1={
                        x -
                        1.2
                      }
                      x2={
                        x -
                        1.2
                      }
                      y1={
                        y1
                      }
                      y2={
                        y2
                      }
                      strokeWidth="3"
                    />
                  </g>
                ) : (
                  <line
                    key={`${x}-${y1}`}
                    x1={
                      x
                    }
                    x2={
                      x
                    }
                    y1={
                      y1
                    }
                    y2={
                      y2
                    }
                  />
                ),
            );
          },
        )}
      </g>
      <g fill="currentColor">
        <path
          d={
            glyph.path
          }
        />
        {glyph.dots.map(
          (
            d,
          ) => (
            <circle
              key={`${d.cx}-${d.cy}`}
              cx={
                d.cx
              }
              cy={
                d.cy
              }
              r={
                d.r
              }
            />
          ),
        )}
        {version ===
        'guitar' ? (
          // The octave-down treble clef's 8, set small under the clef's tail.
          <text
            x="19.5"
            y="101"
            textAnchor="middle"
            direction="ltr"
            fontSize="10"
            className="rmm-display"
            stroke="none"
          >
            8
          </text>
        ) : null}
        {version ===
        'guitar' ? (
          <text
            x="14"
            y={
              TAB_TOP +
              13
            }
            textAnchor="middle"
            direction="ltr"
            fontSize="9"
            className="rmm-display"
            stroke="none"
          >
            <tspan
              x="14"
              dy="0"
            >
              T
            </tspan>
            <tspan
              x="14"
              dy="9"
            >
              A
            </tspan>
            <tspan
              x="14"
              dy="9"
            >
              B
            </tspan>
          </text>
        ) : null}
      </g>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
      >
        {sys.keySig.map(
          (
            k,
          ) => (
            <path
              key={`${k.x}-${k.y}`}
              d={
                k.kind ===
                'sharp'
                  ? sharpPath(
                      k.x,
                      k.y,
                    )
                  : flatPath(
                      k.x,
                      k.y,
                    )
              }
            />
          ),
        )}
      </g>
      {sys.timeSig ? (
        <g
          fill="currentColor"
          textAnchor="middle"
          direction="ltr"
          fontSize="21"
          className="rmm-display"
        >
          <text
            x={
              sys
                .timeSig
                .x
            }
            y={
              STAFF_TOP +
              2 *
                CARD_GAP -
              3
            }
          >
            {
              sys
                .timeSig
                .beats
            }
          </text>
          <text
            x={
              sys
                .timeSig
                .x
            }
            y={
              STAFF_BOTTOM -
              3
            }
          >
            {
              sys
                .timeSig
                .unit
            }
          </text>
        </g>
      ) : null}
    </>
  );
}

function NoteGlyph({
  n,
}: {
  n: LaidNote;
}) {
  return (
    <g>
      {n.ledgers.map(
        (
          l,
          i,
        ) => (
          <path
            key={
              l.y
            }
            d={`M ${l.x0} ${l.y + (i % 2 ? -0.3 : 0.35)} L ${l.x1} ${l.y - (i % 2 ? -0.3 : 0.35)}`}
            strokeWidth="1.4"
            fill="none"
          />
        ),
      )}
      {n.stem ? (
        <line
          x1={
            n
              .stem
              .x
          }
          x2={
            n
              .stem
              .x
          }
          y1={
            n
              .stem
              .y1
          }
          y2={
            n
              .stem
              .y2
          }
          strokeWidth="1.3"
        />
      ) : null}
      {n.flag &&
      n.stem ? (
        <path
          d={flagPath(
            n
              .stem
              .x,
            n
              .stem
              .y2,
            n
              .stem
              .y2 <
              n.y,
          )}
          strokeWidth="1.6"
          fill="none"
        />
      ) : null}
      <ellipse
        cx={
          n.x
        }
        cy={
          n.y
        }
        rx={
          HEAD_RX
        }
        ry={
          HEAD_RY
        }
        transform={`rotate(-20 ${n.x} ${n.y})`}
        {...(n.filled
          ? {
              stroke:
                'none',
            }
          : {
              fill: 'none',
              strokeWidth: 1.6,
            })}
      />
      {n.dot ? (
        <circle
          cx={
            n
              .dot
              .x
          }
          cy={
            n
              .dot
              .y
          }
          r="1.6"
          stroke="none"
        />
      ) : null}
      {n.accidental ? (
        <path
          d={
            n
              .accidental
              .kind ===
            'sharp'
              ? sharpPath(
                  n
                    .accidental
                    .x,
                  n
                    .accidental
                    .y,
                )
              : n
                    .accidental
                    .kind ===
                  'flat'
                ? flatPath(
                    n
                      .accidental
                      .x,
                    n
                      .accidental
                      .y,
                  )
                : naturalPath(
                    n
                      .accidental
                      .x,
                    n
                      .accidental
                      .y,
                  )
          }
          strokeWidth="1.2"
          fill="none"
        />
      ) : null}
    </g>
  );
}

/** The cursor and the pencil marks: the only part that changes during a run. */
function Overlay({
  layout,
  cursor,
  marks,
}: {
  layout: ScoreLayout;
  cursor: number;
  marks: readonly NoteMark[];
}) {
  return (
    <>
      {layout.systems.map(
        (
          sys,
        ) => (
          <g
            key={
              sys.index
            }
            transform={`translate(0 ${sys.top})`}
          >
            {sys.notes.map(
              (
                n,
              ) => {
                const mark =
                  marks[
                    n
                      .index
                  ] ??
                  null;
                if (
                  n.index ===
                  cursor
                ) {
                  return (
                    <g
                      key={
                        n.index
                      }
                      className="text-app-accent"
                      stroke="currentColor"
                      fill="currentColor"
                    >
                      <ellipse
                        cx={
                          n.x
                        }
                        cy={
                          n.y
                        }
                        rx={
                          HEAD_RX
                        }
                        ry={
                          HEAD_RY
                        }
                        transform={`rotate(-20 ${n.x} ${n.y})`}
                        {...(n.filled
                          ? {
                              stroke:
                                'none',
                            }
                          : {
                              fill: 'none',
                              strokeWidth: 1.8,
                            })}
                      />
                      <path
                        d={nowMarkPath(
                          n.x,
                          NOW_Y,
                        )}
                        fill="none"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                }
                if (
                  !mark
                )
                  return null;
                return (
                  <path
                    key={
                      n.index
                    }
                    className={
                      mark ===
                      'right'
                        ? 'text-app-accent'
                        : 'text-app-danger'
                    }
                    d={markPath(
                      n.x,
                      MARK_Y,
                      mark ===
                        'right',
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              },
            )}
          </g>
        ),
      )}
    </>
  );
}
