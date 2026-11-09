'use client';

/**
 * TapBeatLesson — `rhythm-tap-the-beat`: Start, a count-in of four clicks at 80 bpm, then sixteen
 * beats the learner taps along with, on the pad, a computer key, or a MIDI controller. The
 * microphone is not used for rhythm: a tap is a moment, and the mic's pitch detector reports a note
 * only once it has settled, a tenth of a second late and with no hit time to compare.
 *
 * The lifecycle is the pure machine in `machines/tap-beat.ts`; this file carries out its effects:
 * waking sound inside the Start tap (`resumeAudio`, bounded), running the metronome
 * (`audio/metronome.ts`, one per run), and turning its look-ahead `onBeat` into the machine's
 * `beat` at the moment the click is HEARD.
 *
 * **Time.** Taps are the hub's note events and carry their own `performance.now()` timestamp; no
 * handler reads a clock. The metronome's `beatTimes()` are on the same clock. Scoring
 * (`scoring/timing.ts`) subtracts the learner's calibrated latency, or, if they never calibrated,
 * an assumed output delay.
 *
 * **Sound lost mid-run** (a call, a headset unplugged: the context stops) or **a dialog opening**
 * over the lesson ends the run with a plain message and Start begins again; nothing is saved
 * from an abandoned run. Everything the run owns, the metronome and every timer, is cleared on
 * Stop, on unmount, and when sound is lost.
 *
 * The beat marker is one accent bar that moves between four fixed positions by a CSS transition
 * (`.rmm-beat__mark`), once per beat: no animation loop and no frame callback; with Jelly motion
 * set to Still it jumps without the transition. Every box has the height of LessonScreen's
 * RhythmSkeleton.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resumeAudio } from '@/lib/rmhmusic/learn/audio/resume';
import { createMetronome, type Metronome } from '@/lib/rmhmusic/learn/audio/metronome';
import { onSoundChange, soundStatus } from '@/lib/rmhmusic/learn/audio/voice';
import {
  BEATS,
  BPM,
  COUNT_IN,
  TAIL_MS,
  createTapBeatMachine,
  type Effect,
  type State,
} from '@/lib/rmhmusic/learn/machines/tap-beat';
import { starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import { effectiveLatencyMs } from '@/lib/rmhmusic/learn/scoring/timing';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';
import { LessonResult } from './LessonParts';
import { Notehead } from './Notehead';
import { SessionFrame } from './QuestionSession';
import { useLessonInputStart, useNoteEvents } from './useLearnInput';
import { useMachine } from './useMachine';
import { cn } from '@/lib/utils';

/** The note the pad sends through the on-screen keys (never sounded: the pad is silent). */
const PAD_NOTE = 72;
/** The wait before the first click, long enough for the pad to be in reach (s). */
const LEAD_S = 0.4;

export function TapBeatLesson({ lessonId, paused }: { lessonId: string; paused: boolean }) {
  const { t } = useTranslation('c-rmhmusic');
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const latencyMs = useLearnStore((s) => s.profile?.latencyMs ?? 0);
  const [machine] = useState(() => createTapBeatMachine(latencyMs));
  const [state, send] = useMachine(machine);
  // The microphone is not used for rhythm.
  useLessonInputStart({ mic: false });

  /** What the current run owns: the metronome and every timer. */
  const run = useRef<{ metronome: Metronome | null; timers: Set<ReturnType<typeof setTimeout>> }>({
    metronome: null,
    timers: new Set(),
  });
  const stateRef = useRef<State>(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const answersBox = useRef<HTMLDivElement>(null);

  const stopAudio = () => {
    const r = run.current;
    r.metronome?.stop();
    r.metronome = null;
    for (const id of r.timers) clearTimeout(id);
    r.timers.clear();
  };
  /** Run `fn` when the performance clock reaches `atMs`. */
  const at = (atMs: number, fn: () => void) => {
    const id = setTimeout(
      () => {
        run.current.timers.delete(id);
        fn();
      },
      Math.max(0, atMs - performance.now()),
    );
    run.current.timers.add(id);
  };

  const perform = (effects: Effect[]) => {
    for (const fx of effects) {
      switch (fx.type) {
        case 'prepare':
          void prepare(fx.token);
          break;
        case 'stop-audio':
          stopAudio();
          break;
        case 'complete':
          void useLearnStore
            .getState()
            .completeLesson(lessonId, fx.stars, fx.score)
            .then((outcome) => perform(send({ type: 'answered', attempt: fx.attempt, outcome })));
          break;
      }
    }
  };

  const prepare = async (token: number) => {
    const ctx = getAudioContext();
    // Bounded: a resume that never settles shows the plain message instead of hanging here.
    if (!ctx || !(await resumeAudio(ctx))) {
      perform(send({ type: 'prepared', token, ok: false }));
      return;
    }
    const { hub } = useLearnStore.getState();
    if (input === 'keys') await hub?.start('keys').catch(() => {});
    await hub?.start('screen').catch(() => {});
    // The learner left, or pressed Start again, while sound woke.
    if (stateRef.current.kind !== 'preparing' || stateRef.current.token !== token) return;
    stopAudio();
    const tail = TAIL_MS + Math.max(0, effectiveLatencyMs(latencyMs));
    const metronome = createMetronome(ctx, {
      bpm: BPM,
      beatsPerBar: 4,
      onBeat: (beat, bar, atMs) => {
        const n = bar * 4 + beat;
        // The click is scheduled up to 100 ms ahead; the screen follows what is heard.
        at(atMs, () => perform(send({ type: 'beat', token, beat: n })));
        if (n === COUNT_IN + BEATS - 1) {
          at(atMs + tail, () => {
            const beats =
              run.current.metronome?.beatTimes().slice(COUNT_IN, COUNT_IN + BEATS) ?? [];
            perform(send({ type: 'finished', token, beats }));
          });
        }
      },
    });
    run.current.metronome = metronome;
    perform(send({ type: 'prepared', token, ok: true }));
    metronome.start(LEAD_S);
  };

  // Taps: any note-on from the pad, the computer keys or a MIDI controller, stamped by the hub.
  useNoteEvents((e) => {
    if (e.type !== 'on' || e.source === 'mic' || paused) return;
    perform(send({ type: 'tap', time: e.time }));
  });

  // Sound stopping mid-run (a call, a headset) ends the run; so does a dialog opening over it.
  useEffect(() => {
    return onSoundChange(() => {
      const s = stateRef.current;
      if (
        (s.kind === 'preparing' || s.kind === 'counting-in' || s.kind === 'tapping') &&
        soundStatus() !== 'ready'
      ) {
        perform(send({ type: 'lost', token: s.token }));
      }
    });
    // `perform` and `send` are stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const s = stateRef.current;
    if (paused && (s.kind === 'preparing' || s.kind === 'counting-in' || s.kind === 'tapping')) {
      perform(send({ type: 'lost', token: s.token }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
  // Leaving the lesson: nothing keeps running.
  useEffect(() => stopAudio, []);

  // Focus follows the learner to the result's first control, never <body>.
  const over =
    state.kind === 'saving' ||
    state.kind === 'saved' ||
    state.kind === 'failed' ||
    state.kind === 'signed-out';
  useLayoutEffect(() => {
    if (!over) return;
    // The pad that held focus has just been replaced by the result.
    const active = document.activeElement;
    if (!active || active === document.body || !document.contains(active)) {
      answersBox.current
        ?.querySelector<HTMLElement>('a[href], button')
        ?.focus({ preventScroll: true });
    }
  }, [over, state.kind]);

  const running =
    state.kind === 'preparing' || state.kind === 'counting-in' || state.kind === 'tapping';
  const beatNow = beatPosition(state);

  const title =
    state.kind === 'tapping' && state.beat >= 0
      ? t('rhythm-tap-count', {
          n: state.beat + 1,
          total: BEATS,
          defaultValue: 'Beat {{n}} of {{total}}',
        })
      : state.kind === 'counting-in' || state.kind === 'tapping' || state.kind === 'preparing'
        ? t('rhythm-tap-count-in', { defaultValue: 'Count in' })
        : state.kind === 'saved' || state.kind === 'saving'
          ? t('lesson-complete', { defaultValue: 'Lesson complete' })
          : state.kind === 'failed' || state.kind === 'signed-out'
            ? t('lesson-not-saved', { defaultValue: 'Not saved yet' })
            : state.kind === 'no-audio'
              ? t('rhythm-tap-stopped', { defaultValue: 'Stopped' })
              : t('rhythm-tap-ready', { defaultValue: 'Ready when you are' });

  const tapHint =
    input === 'midi'
      ? t('rhythm-tap-hint-midi', { defaultValue: 'Press a key on your controller on every beat.' })
      : input === 'keys'
        ? t('rhythm-tap-hint-keys', {
            defaultValue: 'Tap the pad, press the space bar or a piano key (A to K) on every beat.',
          })
        : input === 'mic'
          ? t('rhythm-tap-hint-mic', {
              defaultValue: "The microphone isn't used for rhythm. Tap the pad on every beat.",
            })
          : t('rhythm-tap-hint-screen', { defaultValue: 'Tap the pad on every beat.' });

  let line: string;
  if (state.kind === 'ready') {
    line = t('rhythm-tap-intro', {
      defaultValue: 'Four clicks count you in. Then tap along for 16 beats.',
    });
  } else if (state.kind === 'preparing' || state.kind === 'counting-in') {
    line = t('rhythm-tap-listen', { defaultValue: 'Listen to the count.' });
  } else if (state.kind === 'tapping') {
    line = tapHint;
  } else if (state.kind === 'no-audio') {
    line = state.lost
      ? t('rhythm-tap-lost', {
          defaultValue: 'Sound stopped, so this run was dropped. Start again.',
        })
      : t('rhythm-tap-no-sound', { defaultValue: "Sound isn't playing. Start to try again." });
  } else {
    line = t('rhythm-tap-result', {
      hits: state.result.hits,
      total: BEATS,
      early: state.result.early,
      late: state.result.late,
      defaultValue: '{{hits}} of {{total}} beats on time. {{early}} early, {{late}} late.',
    });
  }

  let answers: React.ReactNode;
  if (over) {
    answers = (
      <LessonResult
        kind={state.kind}
        stars={state.kind === 'saved' ? state.stars : starsFor(state.result.score)}
        returnTo={`/rmhmusic/lesson/${lessonId}`}
        onRetry={() => perform(send({ type: 'retry' }))}
      />
    );
  } else {
    answers = (
      <TapPad
        mode={state.kind === 'ready' || state.kind === 'no-audio' ? 'start' : 'tap'}
        label={
          state.kind === 'ready'
            ? t('rhythm-tap-start', { defaultValue: 'Start' })
            : state.kind === 'no-audio'
              ? t('rhythm-tap-again', { defaultValue: 'Start again' })
              : state.kind === 'tapping'
                ? t('rhythm-tap-pad', { defaultValue: 'Tap' })
                : t('rhythm-tap-wait', { defaultValue: 'Listen' })
        }
        busy={state.kind === 'preparing'}
        onStart={() => perform(send({ type: 'start' }))}
      />
    );
  }

  return (
    <SessionFrame className="rmm-rhythm space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <h2 className="rmm-display min-h-8 text-2xl leading-8 text-(--app-text)">
          <span key={title}>{title}</span>
        </h2>
        <BeatBar position={running ? beatNow : null} />
        <div className="flex min-h-11 flex-wrap items-center gap-3">
          <div className="flex min-h-10 min-w-0 flex-[1_1_7rem] items-center justify-center">
            <p
              key={state.kind === 'tapping' ? 'tap' : state.kind}
              className="text-sm leading-5 break-words text-(--app-text-muted)"
            >
              {line}
            </p>
          </div>
          <p className="sr-only" aria-live="polite">
            {state.kind === 'tapping' ? '' : `${title}. ${line}`}
          </p>
        </div>
      </section>
      <div ref={answersBox} className="rmm-rhythm__answers">
        {answers}
      </div>
    </SessionFrame>
  );
}

/** Which of the bar's four beats is sounding (0..3), or -1 before the first click. */
function beatPosition(state: State): number {
  if (state.kind === 'counting-in') return state.beat < 0 ? -1 : state.beat % 4;
  if (state.kind === 'tapping') return (COUNT_IN + state.beat) % 4;
  return -1;
}

/**
 * The bar: four noteheads in a row (ltr whatever the language) and one accent bar under them that
 * moves to the beat now sounding. `position` null: no run, the bar is not shown moving.
 */
function BeatBar({ position }: { position: number | null }) {
  const { t } = useTranslation('c-rmhmusic');
  const at = position === null ? -1 : position;
  return (
    <div
      dir="ltr"
      role="img"
      aria-label={t('rhythm-tap-bar', { defaultValue: 'A bar of four beats' })}
      className="rmm-values flex flex-col items-center justify-center gap-3"
    >
      <div className="grid w-full max-w-64 grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="flex justify-center text-(--app-text)">
            <Notehead kind={i === at ? 'filled' : 'open'} className="h-6 w-8" />
          </span>
        ))}
      </div>
      <div className="relative h-1 w-full max-w-64" aria-hidden="true">
        <span
          className="rmm-beat__mark absolute inset-y-0 start-0 w-1/4 bg-(--app-accent)"
          style={{ transform: `translateX(${Math.max(0, at) * 100}%)`, opacity: at < 0 ? 0 : 1 }}
        />
      </div>
    </div>
  );
}

/**
 * The pad: Start before a run (a click, so the browser allows sound), then the tap surface. A tap is
 * the pointer going down, or Space/Enter going down (never a key's repeats), sent through the
 * on-screen input so it is a timestamped note event like any other.
 */
function TapPad({
  mode,
  label,
  busy,
  onStart,
}: {
  mode: 'start' | 'tap';
  label: string;
  busy: boolean;
  onStart: () => void;
}) {
  const pad = (down: boolean) => {
    const { screen } = useLearnStore.getState();
    if (down) screen?.press(PAD_NOTE);
    else screen?.release(PAD_NOTE);
  };
  return (
    <button
      type="button"
      data-focus-first=""
      aria-busy={busy || undefined}
      onClick={mode === 'start' ? onStart : undefined}
      onPointerDown={
        mode === 'tap'
          ? (e) => {
              e.preventDefault();
              pad(true);
            }
          : undefined
      }
      onPointerUp={mode === 'tap' ? () => pad(false) : undefined}
      onPointerCancel={mode === 'tap' ? () => pad(false) : undefined}
      onPointerLeave={mode === 'tap' ? () => pad(false) : undefined}
      onKeyDown={
        mode === 'tap'
          ? (e) => {
              if (e.key !== ' ' && e.key !== 'Enter') return;
              e.preventDefault();
              if (!e.repeat) pad(true);
            }
          : undefined
      }
      onKeyUp={mode === 'tap' ? () => pad(false) : undefined}
      style={{ touchAction: 'none' }}
      className={cn(
        'rmm-sheet rmm-display h-full w-full text-[2rem] leading-10 text-(--app-text) select-none',
        'transition-colors hover:bg-(--app-surface-hover)',
      )}
    >
      <span key={label}>{label}</span>
    </button>
  );
}
