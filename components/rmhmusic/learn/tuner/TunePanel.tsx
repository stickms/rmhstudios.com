/**
 * The tuner tab: a static drawn scale (−50…+50 cents) with one needle, the note (or string) being
 * tuned to, plain advice ("Tune up", "Tune down", "In tune") and the cents, over the microphone.
 *
 * The reading is the pure tuner machine (`lib/rmhmusic/learn/tuner/machine.ts`) fed by the mic's
 * own analysis poll (`subscribeMicFrames`, a 25 ms timer that runs only while the microphone is
 * on): there is no frame loop. Each frame writes the needle's `transform` and the cents text
 * straight to the DOM; React re-renders only when the note, the advice or the phase changes, and
 * the polite live region changes (so speaks) only when the locked note or "in tune" changes. The
 * mic stops when the page is hidden (`useInputRelease` on the screen), so nothing runs then.
 *
 * Without the microphone (MIDI, the computer or on-screen keys) the dial rests and the input
 * region says the tuner needs the microphone, with a button to switch to it. The boxes keep their
 * heights in every state, so nothing moves. All SVG text is `direction="ltr"`.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { playNote } from '@/lib/rmhmusic/learn/audio/voice';
import type { InstrumentId } from '@/lib/rmhmusic/learn/audio/instruments/types';
import {
  useLearnStore,
  subscribeMicFrames,
} from '@/lib/rmhmusic/learn/store';
import type { LearnInput } from '@/lib/rmhmusic/learn/schemas';
import {
  adviceOf,
  tunerInitial,
  tunerStep,
  type TunerAdvice,
  type TunerPreset,
  type TunerState,
} from '@/lib/rmhmusic/learn/tuner/machine';
import { readName } from '@/lib/rmhmusic/learn/tuner/read';
import { STANDARD_TUNING } from '@/lib/rmhmusic/learn/theory/fretboard';
import { cn } from '@/lib/utils';
import { SECONDARY_BUTTON } from '../buttons';
import { InputErrorNotice } from '../InputDetails';
import { DeviceRegion } from '../LessonParts';
import {
  chooseInput,
  useInputPhases,
} from '../useLearnInput';

/** How long a reference tone sounds. */
const REFERENCE_MS = 2000;
/** The chromatic preset's reference: A4, 440 Hz. */
const A4 = 69;

/** The dial: the needle turns about the pivot, ±{@link DIAL_DEG}° for ±50 cents. */
const PIVOT_X = 100;
const PIVOT_Y = 104;
const DIAL_R = 84;
const DIAL_DEG = 60;
const DEG_PER_CENT =
  DIAL_DEG /
  50;

/** What React renders; changes only when the note, the advice or the phase does. */
interface View {
  kind: TunerState['kind'];
  target:
    | number
    | null;
  advice: TunerAdvice | null;
}

function viewOf(
  s: TunerState,
): View {
  return {
    kind: s.kind,
    target:
      s.kind ===
      'locked'
        ? s.target
        : null,
    advice:
      adviceOf(
        s,
      ),
  };
}

const sameView =
  (
    a: View,
    b: View,
  ) =>
    a.kind ===
      b.kind &&
    a.target ===
      b.target &&
    a.advice ===
      b.advice;

function polar(
  deg: number,
  r: number,
): {
  x: number;
  y: number;
} {
  const a =
    (deg *
      Math.PI) /
    180;
  return {
    x:
      PIVOT_X +
      r *
        Math.sin(
          a,
        ),
    y:
      PIVOT_Y -
      r *
        Math.cos(
          a,
        ),
  };
}

/** "−12 cents" / "+3 cents", with a real minus sign. */
function centsText(
  t: TFunction,
  cents: number,
): string {
  const n =
    Math.round(
      cents,
    );
  const signed =
    n >
    0
      ? `+${n}`
      : n <
          0
        ? `−${-n}`
        : '0';
  return t(
    'tuner-cents',
    {
      cents:
        signed,
      defaultValue:
        '{{cents}} cents',
    },
  );
}

function adviceText(
  t: TFunction,
  view: View,
): string {
  if (
    view.kind ===
    'silent'
  )
    return t(
      'tuner-play',
      {
        defaultValue:
          'Play or sing a note.',
      },
    );
  if (
    view.kind ===
    'listening'
  )
    return t(
      'tuner-listening',
      {
        defaultValue:
          'Listening…',
      },
    );
  switch (
    view.advice
  ) {
    case 'up':
      return t(
        'tuner-up',
        {
          defaultValue:
            'Tune up',
        },
      );
    case 'down':
      return t(
        'tuner-down',
        {
          defaultValue:
            'Tune down',
        },
      );
    case 'in-tune':
      return t(
        'tuner-in-tune',
        {
          defaultValue:
            'In tune',
        },
      );
    default:
      return t(
        'tuner-hold',
        {
          defaultValue:
            'Almost: hold it there',
        },
      );
  }
}

export function TunePanel({
  input,
  preset,
  onPreset,
  sound,
  loading,
}: {
  /** The learner's input; null while the profile loads. */
  input: LearnInput | null;
  preset: TunerPreset;
  onPreset: (
    p: TunerPreset,
  ) => void;
  /** The learner's sound for the reference tone; null while the profile loads. */
  sound: InstrumentId | null;
  loading: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const phases =
    useInputPhases();
  const micOn =
    input ===
      'mic' &&
    phases.mic ===
      'active';
  const machine =
    useRef<TunerState>(
      tunerInitial(
        preset,
      ),
    );
  const [
    view,
    setView,
  ] =
    useState<View>(
      () =>
        viewOf(
          machine.current,
        ),
    );
  const viewRef =
    useRef(
      view,
    );
  const needle =
    useRef<SVGGElement>(
      null,
    );
  const cents =
    useRef<HTMLParagraphElement>(
      null,
    );
  const shownCents =
    useRef<
      | number
      | null
    >(
      null,
    );
  const tRef =
    useRef(
      t,
    );
  useEffect(
    () => {
      tRef.current =
        t;
    },
  );
  const presetName =
    useId();

  // Paint one state: the needle and the cents straight to the DOM, React only on a new view.
  const paint =
    useRef(
      (
        s: TunerState,
      ) => {
        const deg =
          s.kind ===
          'locked'
            ? Math.max(
                -50,
                Math.min(
                  50,
                  s.cents,
                ),
              ) *
              DEG_PER_CENT
            : 0;
        needle.current?.setAttribute(
          'transform',
          `rotate(${deg.toFixed(2)} ${PIVOT_X} ${PIVOT_Y})`,
        );
        const rounded =
          s.kind ===
          'locked'
            ? Math.round(
                s.cents,
              )
            : null;
        if (
          rounded !==
            shownCents.current &&
          cents.current
        ) {
          shownCents.current =
            rounded;
          cents.current.textContent =
            rounded ===
            null
              ? ''
              : centsText(
                  tRef.current,
                  rounded,
                );
        }
        const next =
          viewOf(
            s,
          );
        if (
          !sameView(
            next,
            viewRef.current,
          )
        ) {
          viewRef.current =
            next;
          setView(
            next,
          );
        }
      },
    ).current;

  // A new preset, or the mic going off, starts the reading afresh.
  useEffect(() => {
    machine.current =
      tunerInitial(
        preset,
      );
    paint(
      machine.current,
    );
  }, [
    preset,
    micOn,
    paint,
  ]);

  // The mic's frames, only while it is on (the store calls nothing otherwise).
  useEffect(() => {
    if (
      !micOn
    )
      return;
    return subscribeMicFrames(
      (
        frame,
      ) => {
        const next =
          tunerStep(
            machine.current,
            {
              type: 'frame',
              frame,
            },
          );
        if (
          next ===
          machine.current
        )
          return;
        machine.current =
          next;
        paint(
          next,
        );
      },
    );
  }, [
    micOn,
    paint,
  ]);

  // The reference tone: one at a time, released after REFERENCE_MS, and on leaving.
  const reference =
    useRef<{
      release: () => void;
      timer: ReturnType<
        typeof setTimeout
      >;
    } | null>(
      null,
    );
  const stopReference =
    () => {
      const r =
        reference.current;
      if (
        !r
      )
        return;
      clearTimeout(
        r.timer,
      );
      r.release();
      reference.current =
        null;
    };
  useEffect(
    () =>
      stopReference,
    [],
  );
  const playReference =
    (
      midi: number,
    ) => {
      stopReference();
      const release =
        playNote(
          midi,
          sound
            ? {
                instrument:
                  sound,
              }
            : {},
        );
      const timer =
        setTimeout(
          () => {
            release();
            reference.current =
              null;
          },
          REFERENCE_MS,
        );
      reference.current =
        {
          release,
          timer,
        };
    };

  const locked =
    view.kind ===
      'locked' &&
    view.target !==
      null;
  const inTune =
    view.advice ===
    'in-tune';
  const name =
    locked &&
    view.target !==
      null
      ? readName(
          view.target,
        )
      : '';
  const announcement =
    locked
      ? inTune
        ? t(
            'tuner-say-in-tune',
            {
              name,
              defaultValue:
                '{{name}}, in tune',
            },
          )
        : name
      : '';

  const ticks =
    [];
  for (
    let c =
      -50;
    c <=
    50;
    c += 10
  ) {
    const deg =
      c *
      DEG_PER_CENT;
    const major =
      c ===
        0 ||
      Math.abs(
        c,
      ) ===
        50;
    const a =
      polar(
        deg,
        DIAL_R -
          (major
            ? 14
            : 8),
      );
    const b =
      polar(
        deg,
        DIAL_R,
      );
    ticks.push(
      <line
        key={
          c
        }
        x1={
          a.x
        }
        y1={
          a.y
        }
        x2={
          b.x
        }
        y2={
          b.y
        }
        strokeWidth={
          major
            ? 1.6
            : 1.1
        }
      />,
    );
  }
  const arcFrom =
    polar(
      -DIAL_DEG,
      DIAL_R,
    );
  const arcTo =
    polar(
      DIAL_DEG,
      DIAL_R,
    );
  const bandFrom =
    polar(
      -5 *
        DEG_PER_CENT,
      DIAL_R +
        3,
    );
  const bandTo =
    polar(
      5 *
        DEG_PER_CENT,
      DIAL_R +
        3,
    );
  const lowLabel =
    polar(
      -DIAL_DEG,
      DIAL_R +
        12,
    );
  const highLabel =
    polar(
      DIAL_DEG,
      DIAL_R +
        12,
    );

  let region;
  if (
    loading ||
    input ===
      null
  ) {
    region =
      (
        <div
          aria-hidden="true"
          className="app-skeleton h-full w-full"
        />
      );
  } else if (
    input ===
    'mic'
  ) {
    region =
      (
        <DeviceRegion
          input="mic"
          on={
            micOn
          }
        />
      );
  } else {
    region =
      (
        <NeedsMic />
      );
  }

  const strings =
    preset ===
    'guitar'
      ? STANDARD_TUNING
      : [
          A4,
        ];

  return (
    <div className="space-y-4">
      <section
        aria-label={t(
          'tuner-dial',
          {
            defaultValue:
              'Tuner',
          },
        )}
        className="rmm-sheet space-y-1 p-5 text-center sm:p-6"
      >
        <fieldset className="flex flex-wrap justify-center gap-x-6">
          <legend className="sr-only">
            {t(
              'tuner-preset',
              {
                defaultValue:
                  'Tune to',
              },
            )}
          </legend>
          {(
            [
              'chromatic',
              'guitar',
            ] as const
          ).map(
            (
              p,
            ) => (
              <label
                key={
                  p
                }
                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-app-text"
              >
                <input
                  type="radio"
                  name={
                    presetName
                  }
                  value={
                    p
                  }
                  checked={
                    preset ===
                    p
                  }
                  onChange={() =>
                    onPreset(
                      p,
                    )
                  }
                  className="h-4 w-4 accent-[var(--app-accent)]"
                />
                {p ===
                'chromatic'
                  ? t(
                      'tuner-preset-chromatic',
                      {
                        defaultValue:
                          'Any note',
                      },
                    )
                  : t(
                      'tuner-preset-guitar',
                      {
                        defaultValue:
                          'Guitar strings',
                      },
                    )}
              </label>
            ),
          )}
        </fieldset>
        <svg
          viewBox="0 0 200 112"
          aria-hidden="true"
          className="mx-auto block h-auto w-full max-w-72 text-app-text sm:max-w-80"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            className="text-app-text-muted"
          >
            <path
              d={`M ${arcFrom.x} ${arcFrom.y} A ${DIAL_R} ${DIAL_R} 0 0 1 ${arcTo.x} ${arcTo.y}`}
              strokeWidth="1.2"
            />
            {
              ticks
            }
          </g>
          <path
            d={`M ${bandFrom.x} ${bandFrom.y} A ${DIAL_R + 3} ${DIAL_R + 3} 0 0 1 ${bandTo.x} ${bandTo.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-app-accent"
          />
          <g
            fill="currentColor"
            fontSize="9"
            textAnchor="middle"
            className="text-app-text-muted"
          >
            <text
              x={
                lowLabel.x
              }
              y={
                lowLabel.y
              }
              direction="ltr"
            >
              −50
            </text>
            <text
              x={
                PIVOT_X
              }
              y={
                PIVOT_Y -
                DIAL_R -
                6
              }
              direction="ltr"
            >
              0
            </text>
            <text
              x={
                highLabel.x
              }
              y={
                highLabel.y
              }
              direction="ltr"
            >
              +50
            </text>
          </g>
          <g
            ref={
              needle
            }
            transform={`rotate(0 ${PIVOT_X} ${PIVOT_Y})`}
            stroke="currentColor"
            fill="currentColor"
            className={cn(
              !locked &&
                'text-app-text-muted opacity-40',
              locked &&
                inTune &&
                'text-app-accent',
            )}
          >
            <line
              x1={
                PIVOT_X
              }
              y1={
                PIVOT_Y
              }
              x2={
                PIVOT_X
              }
              y2={
                PIVOT_Y -
                DIAL_R +
                4
              }
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle
              cx={
                PIVOT_X
              }
              cy={
                PIVOT_Y
              }
              r="4"
              stroke="none"
            />
          </g>
        </svg>
        <p
          dir="ltr"
          className={cn(
            'rmm-display h-12 text-[2.5rem] leading-[3rem]',
            inTune
              ? 'text-app-accent'
              : 'text-app-text',
          )}
        >
          {
            name
          }
        </p>
        <p className="h-6 text-base leading-6 text-app-text">
          {adviceText(
            t,
            view,
          )}
        </p>
        <p
          ref={
            cents
          }
          dir="ltr"
          className="h-6 text-sm leading-6 text-app-text-muted tabular-nums"
        />
        <p
          role="status"
          className="sr-only"
        >
          {
            announcement
          }
        </p>
      </section>
      <div className="rmm-input-region">
        {
          region
        }
      </div>
      <div className="space-y-1">
        <p className="text-sm leading-6 text-app-text-muted">
          {preset ===
          'guitar'
            ? t(
                'tuner-reference-strings',
                {
                  defaultValue:
                    'Hear a string in tune:',
                },
              )
            : t(
                'tuner-reference-a4',
                {
                  defaultValue:
                    'Hear A4 (440 Hz):',
                },
              )}
        </p>
        <div
          className="grid grid-cols-6 gap-1"
          dir="ltr"
        >
          {strings.map(
            (
              midi,
            ) => (
              <button
                key={
                  midi
                }
                type="button"
                disabled={
                  loading
                }
                onClick={() =>
                  playReference(
                    midi,
                  )
                }
                aria-label={t(
                  'tuner-play-reference',
                  {
                    name: readName(
                      midi,
                    ),
                    defaultValue:
                      'Play {{name}}',
                  },
                )}
                className={cn(
                  SECONDARY_BUTTON,
                  'min-w-11 px-0',
                  preset !==
                    'guitar' &&
                    'col-span-2',
                )}
              >
                {readName(
                  midi,
                )}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** Not the microphone: what the tuner needs, and a button to switch to it (a click, for iOS). */
function NeedsMic() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const hub =
    useLearnStore(
      (
        s,
      ) =>
        s.hub,
    );
  const [
    failed,
    setFailed,
  ] =
    useState<Error | null>(
      null,
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const switchToMic =
    async () => {
      setBusy(
        true,
      );
      const ok =
        await chooseInput(
          'mic',
        );
      setBusy(
        false,
      );
      setFailed(
        ok
          ? null
          : (hub?.lastError(
              'mic',
            ) ??
              new Error(
                'mic',
              )),
      );
    };
  return (
    <section className="rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto overscroll-contain p-4 text-center">
      {failed ? (
        <InputErrorNotice
          source="mic"
          error={
            failed
          }
          onFallback={() => {
            setFailed(
              null,
            );
            void chooseInput(
              'screen',
            );
          }}
        />
      ) : (
        <>
          <p className="text-sm leading-6 text-app-text-muted">
            {t(
              'tuner-needs-mic',
              {
                defaultValue:
                  'The tuner listens through the microphone. Your notes can still be read on the Read notes tab.',
              },
            )}
          </p>
          <button
            type="button"
            disabled={
              busy
            }
            onClick={() =>
              void switchToMic()
            }
            className={
              SECONDARY_BUTTON
            }
          >
            {t(
              'tuner-use-mic',
              {
                defaultValue:
                  'Use the microphone',
              },
            )}
          </button>
        </>
      )}
    </section>
  );
}
