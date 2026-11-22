/**
 * The tuner tab: a static drawn scale (−50…+50 cents) with one needle, the note (or string) being
 * tuned to, plain advice ("Tune up", "Tune down", "In tune", "Not near a string") and the cents,
 * over the microphone.
 *
 * The reading is the pure tuner machine (`lib/rmhmusic/learn/tuner/machine.ts`) fed by the mic's
 * own analysis poll (`subscribeMicFrames`, a 25 ms timer that runs only while the microphone is
 * on): there is no frame loop. Each frame writes the needle's `transform` and the cents text
 * straight to the DOM; React re-renders only when the note, the advice or the phase changes. The
 * polite live region says the note and the advice (both change only at band crossings, with
 * hysteresis), and keeps the last thing it said through silence, so a string plucked again and
 * still in tune is not announced again. The mic stops when the page is hidden (`useInputRelease`
 * on the screen), so nothing runs then.
 *
 * A reference tone is heard by the microphone too (it runs with no echo cancellation): while one
 * sounds, and for the echo tail after, the machine ignores the mic (`reference`) and the screen
 * says "Listening…".
 *
 * Without the microphone (MIDI, the computer or on-screen keys) the dial rests and the input
 * region says the tuner needs the microphone, with a button to switch to it. The boxes keep their
 * heights in every state, so nothing moves. All SVG text is `direction="ltr"`.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { playNote, soundReleaseMs } from '@/lib/rmhmusic/learn/audio/voice';
import type { InstrumentId } from '@/lib/rmhmusic/learn/audio/instruments/types';
import { useLearnStore, subscribeMicFrames } from '@/lib/rmhmusic/learn/store';
import type { LearnInput } from '@/lib/rmhmusic/learn/schemas';
import {
  adviceOf,
  shownNote,
  tunerInitial,
  tunerStep,
  type TunerAdvice,
  type TunerEvent,
  type TunerPreset,
  type TunerState,
} from '@/lib/rmhmusic/learn/tuner/machine';
import { readName } from '@/lib/rmhmusic/learn/tuner/read';
import { STANDARD_TUNING } from '@/lib/rmhmusic/learn/theory/fretboard';
import { cn } from '@/lib/utils';
import { SECONDARY_BUTTON } from '../buttons';
import { InputErrorNotice } from '../InputDetails';
import { DeviceRegion } from '../LessonParts';
import { chooseInput, useInputPhases } from '../useLearnInput';
import { centsText } from './cents';

/** How long a reference tone is held before its release. */
const REFERENCE_MS = 2000;
/** The chromatic preset's reference: A4, 440 Hz. */
const A4 = 69;

/** The dial: the needle turns about the pivot, ±{@link DIAL_DEG}° for ±50 cents. */
const PIVOT_X = 100;
const PIVOT_Y = 104;
const DIAL_R = 84;
const DIAL_DEG = 60;
const DEG_PER_CENT = DIAL_DEG / 50;

/** What React renders; changes only when the note, the advice or the phase does. */
interface View {
  kind: TunerState['kind'];
  shown: number | null;
  advice: TunerAdvice | null;
}

function viewOf(s: TunerState): View {
  return {
    kind: s.kind,
    shown: shownNote(s),
    advice: adviceOf(s),
  };
}

const sameView = (a: View, b: View) => a.kind === b.kind && a.shown === b.shown && a.advice === b.advice;

/** The needle's angle: the cents on the dial, at rest unless a string or note is near. */
function needleDeg(s: TunerState): number {
  if (s.kind !== 'locked' || s.advice === 'far') return 0;
  return Math.max(-50, Math.min(50, s.cents)) * DEG_PER_CENT;
}

function polar(
  deg: number,
  r: number,
): {
  x: number;
  y: number;
} {
  const a = (deg * Math.PI) / 180;
  // Rounded to 1/100 of a unit: the server's and the browser's sin/cos can differ in the last
  // digits, which would be a hydration mismatch on every tick.
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    x: round(PIVOT_X + r * Math.sin(a)),
    y: round(PIVOT_Y - r * Math.cos(a)),
  };
}

function adviceText(t: TFunction, view: View): string {
  if (view.kind === 'silent')
    return t('tuner-play', {
      defaultValue: 'Play or sing a note.',
    });
  if (view.kind === 'listening' || view.kind === 'muted')
    return t('tuner-listening', {
      defaultValue: 'Listening…',
    });
  switch (view.advice) {
    case 'up':
      return t('tuner-up', {
        defaultValue: 'Tune up',
      });
    case 'down':
      return t('tuner-down', {
        defaultValue: 'Tune down',
      });
    case 'in-tune':
      return t('tuner-in-tune', {
        defaultValue: 'In tune',
      });
    case 'far':
      return t('tuner-far', {
        defaultValue: 'Not near a string',
      });
    default:
      return t('tuner-hold', {
        defaultValue: 'Almost: hold it there',
      });
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
  onPreset: (p: TunerPreset) => void;
  /** The learner's sound for the reference tone; null while the profile loads. */
  sound: InstrumentId | null;
  loading: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const phases = useInputPhases();
  const micOn = input === 'mic' && phases.mic === 'active';
  const machine = useRef<TunerState>(tunerInitial(preset));
  const [view, setView] = useState<View>(() => viewOf(machine.current));
  const viewRef = useRef(view);
  const needle = useRef<SVGGElement>(null);
  const cents = useRef<HTMLParagraphElement>(null);
  const shownCents = useRef<number | null>(null);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const presetName = useId();

  // Paint one state: the needle and the cents straight to the DOM, React only on a new view.
  const paint = useRef((s: TunerState) => {
    needle.current?.setAttribute('transform', `rotate(${(needleDeg(s) || 0).toFixed(2)} ${PIVOT_X} ${PIVOT_Y})`);
    const rounded = s.kind === 'locked' && s.advice !== 'far' ? Math.round(s.cents) : null;
    if (rounded !== shownCents.current && cents.current) {
      shownCents.current = rounded;
      // A new text node each time, not a changed one: a centred line whose existing text
      // changes width is re-centred, which the browser counts as a layout shift.
      cents.current.replaceChildren(rounded === null ? '' : centsText(tRef.current, rounded));
    }
    const next = viewOf(s);
    if (!sameView(next, viewRef.current)) {
      viewRef.current = next;
      setView(next);
    }
  }).current;
  const send = useRef((e: TunerEvent) => {
    const next = tunerStep(machine.current, e);
    if (next === machine.current) return;
    machine.current = next;
    paint(next);
  }).current;

  // A new preset, or the mic going off, starts the reading afresh (a reference tone still
  // sounding keeps the mic muted: the machine keeps `muted` across a preset change).
  useEffect(() => {
    send({
      type: 'preset',
      preset,
    });
  }, [preset, send]);
  useEffect(() => {
    if (!micOn)
      send({
        type: 'reset',
      });
  }, [micOn, send]);

  // The mic's frames, only while it is on (the store calls nothing otherwise).
  useEffect(() => {
    if (!micOn) return;
    return subscribeMicFrames((frame) =>
      send({
        type: 'frame',
        frame,
      }),
    );
  }, [micOn, send]);

  // The reference tone: one at a time, released after REFERENCE_MS, and on leaving.
  const reference = useRef<{
    release: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const stopReference = () => {
    const r = reference.current;
    if (!r) return;
    clearTimeout(r.timer);
    r.release();
    reference.current = null;
  };
  useEffect(() => stopReference, []);
  const playReference = (midi: number) => {
    stopReference();
    const voicing = sound
      ? {
          instrument: sound,
        }
      : {};
    // The mic hears the speaker: ignore it until the tone and its release have ended (+ the echo
    // tail, which the machine adds), on the frames' own clock.
    send({
      type: 'reference',
      end: performance.now() + REFERENCE_MS + soundReleaseMs(voicing),
    });
    const release = playNote(midi, voicing);
    const timer = setTimeout(() => {
      release();
      reference.current = null;
    }, REFERENCE_MS);
    reference.current = {
      release,
      timer,
    };
  };

  const locked = view.kind === 'locked' && view.shown !== null;
  const far = view.advice === 'far';
  const inTune = view.advice === 'in-tune';
  const name = locked && view.shown !== null ? readName(view.shown) : '';

  // Said once per change of note or advice, and kept through silence and listening.
  const [said, setSaid] = useState('');
  const advice = adviceText(t, view);
  useEffect(() => {
    if (!locked) return;
    setSaid(
      t('tuner-say', {
        name,
        advice,
        defaultValue: '{{name}}: {{advice}}',
      }),
    );
  }, [locked, name, advice, t]);
  useEffect(() => setSaid(''), [preset]);

  const ticks = [];
  for (let c = -50; c <= 50; c += 10) {
    const deg = c * DEG_PER_CENT;
    const major = c === 0 || Math.abs(c) === 50;
    const a = polar(deg, DIAL_R - (major ? 14 : 8));
    const b = polar(deg, DIAL_R);
    ticks.push(<line key={c} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={major ? 1.6 : 1.1} />);
  }
  const arcFrom = polar(-DIAL_DEG, DIAL_R);
  const arcTo = polar(DIAL_DEG, DIAL_R);
  const bandFrom = polar(-5 * DEG_PER_CENT, DIAL_R + 3);
  const bandTo = polar(5 * DEG_PER_CENT, DIAL_R + 3);
  const lowLabel = polar(-DIAL_DEG, DIAL_R + 12);
  const highLabel = polar(DIAL_DEG, DIAL_R + 12);

  let region;
  if (loading || input === null) {
    region = <div aria-hidden="true" className="app-skeleton h-full w-full" />;
  } else if (input === 'mic') {
    region = <DeviceRegion input="mic" on={micOn} />;
  } else {
    region = <NeedsMic />;
  }

  const strings = preset === 'guitar' ? STANDARD_TUNING : [A4];

  return (
    <div className="space-y-4">
      <section
        aria-label={t('tuner-reading-label', {
          defaultValue: 'The reading',
        })}
        className="rmm-sheet rmm-tuner space-y-1 p-5 text-center sm:p-6"
      >
        <fieldset className="flex flex-wrap justify-center gap-x-6">
          <legend className="sr-only">
            {t('tuner-preset', {
              defaultValue: 'Tune to',
            })}
          </legend>
          {(['chromatic', 'guitar'] as const).map((p) => (
            <label key={p} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-app-text">
              <input
                type="radio"
                name={presetName}
                value={p}
                checked={preset === p}
                onChange={() => onPreset(p)}
                className="h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 bg-transparent checked:border-[6px] checked:border-[color:var(--app-accent)]!"
              />
              {p === 'chromatic'
                ? t('tuner-preset-chromatic', {
                    defaultValue: 'Any note',
                  })
                : t('tuner-preset-guitar', {
                    defaultValue: 'Guitar strings',
                  })}
            </label>
          ))}
        </fieldset>
        <svg
          viewBox="0 0 200 112"
          aria-hidden="true"
          className="mx-auto block h-auto w-full max-w-72 text-app-text sm:max-w-80"
        >
          <g fill="none" stroke="currentColor" strokeLinecap="round" className="text-app-text-muted">
            <path
              d={`M ${arcFrom.x} ${arcFrom.y} A ${DIAL_R} ${DIAL_R} 0 0 1 ${arcTo.x} ${arcTo.y}`}
              strokeWidth="1.2"
            />
            {ticks}
          </g>
          <path
            d={`M ${bandFrom.x} ${bandFrom.y} A ${DIAL_R + 3} ${DIAL_R + 3} 0 0 1 ${bandTo.x} ${bandTo.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-app-accent"
          />
          <g fill="currentColor" fontSize="9" textAnchor="middle" className="text-app-text-muted">
            <text x={lowLabel.x} y={lowLabel.y} direction="ltr">
              −50
            </text>
            <text x={PIVOT_X} y={PIVOT_Y - DIAL_R - 6} direction="ltr">
              0
            </text>
            <text x={highLabel.x} y={highLabel.y} direction="ltr">
              +50
            </text>
          </g>
          <g
            ref={needle}
            transform={`rotate(0 ${PIVOT_X} ${PIVOT_Y})`}
            stroke="currentColor"
            fill="currentColor"
            className={cn((!locked || far) && 'text-app-text-muted opacity-40', locked && inTune && 'text-app-accent')}
          >
            <line
              x1={PIVOT_X}
              y1={PIVOT_Y}
              x2={PIVOT_X}
              y2={PIVOT_Y - DIAL_R + 4}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx={PIVOT_X} cy={PIVOT_Y} r="4" stroke="none" />
          </g>
        </svg>
        <p
          key={`name:${name}`}
          dir="ltr"
          className={cn('rmm-display h-12 text-[2.5rem] leading-[3rem]', inTune ? 'text-app-accent' : 'text-app-text')}
        >
          {name}
        </p>
        <p key={`advice:${view.kind}:${view.advice}`} className="h-6 text-base leading-6 text-app-text">
          {advice}
        </p>
        <p ref={cents} dir="ltr" className="h-6 text-sm leading-6 text-app-text-muted tabular-nums" />
        <p role="status" className="sr-only">
          {said}
        </p>
      </section>
      <div className="rmm-input-region">{region}</div>
      <div className="space-y-1">
        <p className="text-sm leading-6 text-app-text-muted">
          {preset === 'guitar'
            ? t('tuner-reference-strings', {
                defaultValue: 'Hear a string in tune:',
              })
            : t('tuner-reference-a4', {
                defaultValue: 'Hear A4 (440 Hz):',
              })}
        </p>
        <div className="grid grid-cols-6 gap-1" dir="ltr">
          {strings.map((midi) => (
            <button
              key={midi}
              type="button"
              disabled={loading}
              onClick={() => playReference(midi)}
              aria-label={t('tuner-play-reference', {
                name: readName(midi),
                defaultValue: 'Play {{name}}',
              })}
              className={cn(SECONDARY_BUTTON, 'min-w-11 px-0', preset !== 'guitar' && 'col-span-2')}
            >
              {readName(midi)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Not the microphone: what the tuner needs, and a button to switch to it (a click, for iOS). */
function NeedsMic() {
  const { t } = useTranslation('c-rmhmusic');
  const hub = useLearnStore((s) => s.hub);
  const [failed, setFailed] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const switchToMic = async () => {
    setBusy(true);
    const ok = await chooseInput('mic');
    setBusy(false);
    setFailed(ok ? null : (hub?.lastError('mic') ?? new Error('mic')));
  };
  return (
    <section className="rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto overscroll-contain p-4 text-center">
      {failed ? (
        <InputErrorNotice
          source="mic"
          error={failed}
          onFallback={() => {
            setFailed(null);
            void chooseInput('screen');
          }}
        />
      ) : (
        <>
          <p className="text-sm leading-6 text-app-text-muted">
            {t('tuner-needs-mic', {
              defaultValue:
                'The tuner listens through the microphone. Your notes can still be read on the Read notes tab.',
            })}
          </p>
          <button type="button" disabled={busy} onClick={() => void switchToMic()} className={SECONDARY_BUTTON}>
            {t('tuner-use-mic', {
              defaultValue: 'Use the microphone',
            })}
          </button>
        </>
      )}
    </section>
  );
}
