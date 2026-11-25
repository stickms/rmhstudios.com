/**
 * RhythmReadLesson — `rhythm-reading` ("Read rhythms"): eight one-bar patterns, each drawn on a
 * percussion staff (`RhythmBar`), LISTENED to (the pattern plays once on the metronome's click sound;
 * Listen again plays it again) and then tapped back after a count-in of one bar, on the pad, a
 * computer key or a MIDI controller. The microphone is not used for rhythm: a tap is a moment, and the
 * pitch detector reports a note only once it has settled. Each tap is scored against the written
 * onsets (`scoring/onsets.ts`); the bar is then drawn again with a word under each note (on time,
 * early, late, missed) and under each tap that answered nothing (a tap in a rest is one).
 *
 * The lifecycle is the pure machine in `machines/rhythm-reading.ts`; this file carries out its
 * effects, as `TapBeatLesson` does for the steady beat: waking sound inside the press that asks for it
 * (`resumeAudio`, bounded), playing the pattern (`audio/rhythm-playback.ts`), running the metronome
 * (`audio/metronome.ts`, one per run) and turning its look-ahead `onBeat` into the machine's `beat`
 * at the moment the click is HEARD. Taps are the hub's note events, each stamped with the input
 * event's own `performance.now()` timestamp by the adapter that read it; nothing here reads a clock
 * to stamp a tap.
 *
 * **A run is dropped** (`lost`: a plain message, Listen or Tap begins again, nothing is saved) when
 * sound stops mid-run, a dialog opens over the lesson, the tab is hidden or the window stays out of
 * focus long enough for timers to be throttled, or the metronome had to skip a click. Everything a
 * run owns, the pattern, the metronome and every timer, is cleared when it ends, on unmount and when
 * it is dropped.
 *
 * Nothing moves at rest: the line through the sounding note exists only while the pattern plays, and
 * the beat mark only during a run.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RHYTHM_READ_BPM, rhythmReadingPatterns } from '@/lib/rmhmusic/learn/content/rhythm-patterns';
import { resumeAudio } from '@/lib/rmhmusic/learn/audio/resume';
import { createMetronome, type Metronome } from '@/lib/rmhmusic/learn/audio/metronome';
import { createRhythmPlayback, type RhythmPlayback } from '@/lib/rmhmusic/learn/audio/rhythm-playback';
import { onSoundChange, soundStatus } from '@/lib/rmhmusic/learn/audio/voice';
import { watchAway } from '@/lib/rmhmusic/learn/input/away-watch';
import {
  createRhythmReadingMachine,
  finishEvent,
  isLive,
  runClicks,
  runStillWanted,
  tailMs,
  type Effect,
} from '@/lib/rmhmusic/learn/machines/rhythm-reading';
import { getPracticeMode } from '@/lib/rmhmusic/learn/practice-mode';
import { starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { beatMs, meterBeats, type RhythmPattern } from '@/lib/rmhmusic/learn/theory/rhythm';
import { getAudioContext } from '@/lib/shared/platform';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { LessonResult } from './LessonParts';
import { PracticeModeToggle, usePracticeMode } from './PracticeModeToggle';
import { SaidParts, SessionFrame } from './QuestionSession';
import { RhythmBar } from './RhythmBar';
import { TapPad, releasePad } from './TapBeatLesson';
import { useLessonInputStart, useNoteEvents } from './useLearnInput';
import { useMachine } from './useMachine';

/** The wait before the first click of a run, long enough for the pad to be in reach (s). */
const LEAD_S = 0.4;

const NO_PATTERNS: readonly RhythmPattern[] = [];

export function RhythmReadLesson({ lessonId, paused }: { lessonId: string; paused: boolean }) {
  const { t } = useTranslation('music-rhythms');
  const patterns = rhythmReadingPatterns(lessonId) ?? NO_PATTERNS;
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const latencyMs = useLearnStore((s) => s.profile?.latencyMs ?? 0);
  const practiceMode = usePracticeMode();
  const [machine] = useState(() =>
    createRhythmReadingMachine(patterns, latencyMs, () => getPracticeMode() === 'learning'),
  );
  const [state, send, getState] = useMachine(machine);
  // The sounding note while the pattern plays (the line through it); null the rest of the time.
  const [playing, setPlaying] = useState<number | null>(null);
  // The microphone is not used for rhythm.
  useLessonInputStart({ mic: false });

  /** What the current run owns: the pattern, the metronome and every timer. */
  const run = useRef<{
    playback: RhythmPlayback | null;
    metronome: Metronome | null;
    timers: Set<ReturnType<typeof setTimeout>>;
  }>({ playback: null, metronome: null, timers: new Set() });
  /** False once the lesson has been left: an `await` that resumes after that starts nothing. */
  const mounted = useRef(false);
  const answersBox = useRef<HTMLDivElement>(null);

  const stopAudio = () => {
    const r = run.current;
    r.playback?.cancel();
    r.playback = null;
    r.metronome?.stop();
    r.metronome = null;
    for (const id of r.timers) clearTimeout(id);
    r.timers.clear();
    if (mounted.current) setPlaying(null);
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
        case 'play':
          void play(fx.token, fx.index);
          break;
        case 'prepare':
          void prepare(fx.token, fx.index);
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

  /** Wake sound, then `go`; false when sound did not wake or the run was dropped meanwhile. */
  const wake = async (token: number, kind: 'listening' | 'preparing') => {
    const wanted = () => runStillWanted({ mounted: mounted.current, state: getState(), token, kind });
    const ctx = getAudioContext();
    // Bounded: a resume that never settles shows the plain message instead of hanging here.
    const awake = ctx ? await resumeAudio(ctx) : false;
    if (!wanted()) return null;
    if (!ctx || !awake) return { ctx: null, wanted };
    return { ctx, wanted };
  };

  const play = async (token: number, index: number) => {
    const woke = await wake(token, 'listening');
    if (!woke) return;
    const pattern = patterns[index];
    if (!woke.ctx || !pattern) {
      perform(send({ type: 'played', token, ok: false }));
      return;
    }
    stopAudio();
    const playback = createRhythmPlayback({
      ctx: () => woke.ctx,
      bpm: RHYTHM_READ_BPM,
      onNote: (n) => {
        if (mounted.current) setPlaying(n);
      },
      onHeard: () => {
        run.current.playback = null;
        if (mounted.current) setPlaying(null);
        perform(send({ type: 'played', token, ok: true }));
      },
    });
    run.current.playback = playback;
    if (!playback.start(index, pattern)) perform(send({ type: 'played', token, ok: false }));
  };

  const prepare = async (token: number, index: number) => {
    const woke = await wake(token, 'preparing');
    if (!woke) return;
    const pattern = patterns[index];
    if (!woke.ctx || !pattern) {
      perform(send({ type: 'prepared', token, ok: false }));
      return;
    }
    const { hub } = useLearnStore.getState();
    if (input === 'keys') await hub?.start('keys').catch(() => {});
    if (!woke.wanted()) return;
    await hub?.start('screen').catch(() => {});
    // The learner left, pressed Listen again, or the run was dropped, while sound woke.
    if (!woke.wanted()) return;
    // The tab was hidden while it woke: timers are throttled, so there is no run to give.
    if (document.hidden) {
      perform(send({ type: 'lost', token }));
      return;
    }
    stopAudio();
    const n = meterBeats(pattern.meter);
    const clicks = runClicks(pattern.meter);
    const tail = tailMs(latencyMs);
    const metronome: Metronome = createMetronome(woke.ctx, {
      bpm: RHYTHM_READ_BPM,
      beatsPerBar: n,
      // A bar of count-in and the bar: nothing past the last beat can ever sound.
      count: clicks,
      onBeat: (beat, bar, atMs) => {
        const k = bar * n + beat;
        // The click is scheduled up to 100 ms ahead; the screen follows what is heard.
        at(atMs, () => perform(send({ type: 'beat', token, beat: k })));
        if (k === clicks - 1) {
          // The bar ends a beat after its last click; a late tap is waited for after that.
          at(atMs + beatMs(RHYTHM_READ_BPM) + tail, () => {
            if (run.current.metronome !== metronome) return;
            perform(send(finishEvent(token, metronome.beatTimes(), metronome.skipped(), pattern.meter)));
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
      const s = getState();
      if (isLive(s) && soundStatus() !== 'ready') perform(send({ type: 'lost', token: s.token }));
    });
    // `perform`, `send` and `getState` are stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const s = getState();
    if (paused && isLive(s)) perform(send({ type: 'lost', token: s.token }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
  // The tab hidden, or the window out of focus long enough for timers to be throttled, drops the run.
  const live = isLive(state);
  useEffect(() => {
    if (!live) return;
    return watchAway({
      doc: document,
      win: window,
      onAway: () => {
        const s = getState();
        if (isLive(s)) perform(send({ type: 'lost', token: s.token }));
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  // Leaving the lesson: nothing keeps running, and the pad lets go. (Set on every mount, so React's
  // mount-cleanup-mount in development leaves it mounted.)
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAudio();
      releasePad();
    };
  }, []);

  // Focus follows the learner to the next control, never <body>: the result's first control, or the
  // button that replaced the pad.
  const result =
    state.kind === 'saving' || state.kind === 'saved' || state.kind === 'failed' || state.kind === 'signed-out'
      ? state
      : null;
  // (Not on the first pattern's first showing: only once a run has come and gone.)
  const settled = result !== null || state.kind === 'feedback' || (state.kind === 'asking' && state.token > 0);
  useLayoutEffect(() => {
    if (!settled) return;
    const active = document.activeElement;
    if (!active || active === document.body || !document.contains(active)) {
      const box = answersBox.current;
      (box?.querySelector<HTMLElement>('[data-primary]') ?? box?.querySelector<HTMLElement>('a[href], button'))?.focus({
        preventScroll: true,
      });
    }
  }, [settled, state.kind]);

  // The pad is a new button when the taps open (the "Tap it" button that was pressed is gone), so
  // focus goes to it: Space and Enter tap only while the pad has focus.
  const tappingNow = state.kind === 'tapping';
  useLayoutEffect(() => {
    if (!tappingNow) return;
    answersBox.current?.querySelector<HTMLElement>('[data-focus-first]')?.focus({ preventScroll: true });
  }, [tappingNow]);

  const index = 'index' in state ? state.index : Math.max(0, patterns.length - 1);
  const pattern = patterns[index];
  const total = patterns.length;
  const n = pattern ? meterBeats(pattern.meter) : 4;
  const beatNow =
    state.kind === 'counting-in'
      ? state.beat < 0
        ? null
        : state.beat % n
      : state.kind === 'tapping'
        ? (n + state.beat) % n
        : null;
  const attempt = state.kind === 'feedback' ? state.attempt : null;
  const learning = practiceMode === 'learning';

  const title = result
    ? result.kind === 'saved' || result.kind === 'saving'
      ? t('lesson-complete', { defaultValue: 'Lesson complete' })
      : t('lesson-not-saved', { defaultValue: 'Not saved yet' })
    : t('pattern-count', { n: index + 1, total, defaultValue: 'Pattern {{n}} of {{total}}' });

  const tapHint =
    input === 'midi'
      ? t('hint-tap-midi', { defaultValue: 'Press a key on your controller on each note. Stay silent for rests.' })
      : input === 'keys'
        ? t('hint-tap-keys', {
            defaultValue: 'Tap the pad or press a piano key (A to K) on each note. Stay silent for rests.',
          })
        : input === 'mic'
          ? t('hint-tap-mic', { defaultValue: "The microphone isn't used for rhythm. Tap the pad on each note." })
          : t('hint-tap-screen', { defaultValue: 'Tap the pad on each note. Stay silent for rests.' });

  // Sentences for the line under the bar, each its own string (never joined with a stop of ours).
  let lines: string[];
  switch (state.kind) {
    case 'asking':
      lines = [
        state.notice === 'no-audio'
          ? t('notice-no-audio', { defaultValue: "Sound isn't playing. Press Listen to try again." })
          : state.notice === 'lost'
            ? t('notice-lost', { defaultValue: 'Sound stopped, so this run was dropped. Try again.' })
            : state.heard
              ? t('hint-ready', { defaultValue: 'A bar of clicks counts you in. Then tap each note.' })
              : t('hint-listen', { defaultValue: 'Listen to the rhythm, then tap it back.' }),
      ];
      break;
    case 'listening':
      lines = [t('line-listening', { defaultValue: 'Listen.' })];
      break;
    case 'preparing':
    case 'counting-in':
      lines = [t('line-count-in', { defaultValue: 'Count in. Get ready to tap.' })];
      break;
    case 'tapping':
      lines = [tapHint];
      break;
    case 'feedback': {
      const a = state.attempt;
      lines = [
        t('fb-result', {
          hits: a.hits,
          total: a.notes.length,
          early: a.early,
          late: a.late,
          missed: a.missed,
          count: a.notes.length,
          defaultValue_one: '{{hits}} of {{total}} note on time. {{early}} early, {{late}} late, {{missed}} missed.',
          defaultValue: '{{hits}} of {{total}} notes on time. {{early}} early, {{late}} late, {{missed}} missed.',
        }),
      ];
      if (a.extras.length > 0)
        lines.push(
          t('fb-extras', {
            count: a.extras.length,
            defaultValue_one: '{{count}} extra tap.',
            defaultValue: '{{count}} extra taps.',
          }),
        );
      lines.push(
        a.passed
          ? t('fb-passed', { defaultValue: 'That passes.' })
          : learning
            ? t('fb-again', { defaultValue: 'Not yet. Try this pattern again.' })
            : t('fb-not-passed', { defaultValue: 'Not this time.' }),
      );
      break;
    }
    default:
      lines = [];
  }

  const last = state.kind === 'feedback' && state.index + 1 >= total && (state.attempt.passed || !learning);
  const heard = state.kind === 'asking' && state.heard;

  let answers: React.ReactNode;
  if (result) {
    answers = (
      <LessonResult
        kind={result.kind}
        stars={result.kind === 'saved' ? result.stars : starsFor(result.score)}
        returnTo={`/rmhmusic/lesson/${lessonId}`}
        onRetry={() => perform(send({ type: 'retry' }))}
      />
    );
  } else if (state.kind === 'tapping') {
    answers = <TapPad mode="tap" label={t('pad-tap', { defaultValue: 'Tap' })} busy={false} onStart={() => {}} />;
  } else if (state.kind === 'feedback') {
    answers = (
      <div className="rmm-sheet flex h-full flex-col items-center justify-center gap-3 p-4">
        <button
          type="button"
          data-primary=""
          onClick={() => perform(send({ type: 'next' }))}
          className={PRIMARY_BUTTON}
        >
          {last
            ? t('button-finish', { defaultValue: 'Finish' })
            : !state.attempt.passed && learning
              ? t('button-again', { defaultValue: 'Try again' })
              : t('button-next', { defaultValue: 'Next pattern' })}
        </button>
      </div>
    );
  } else if (state.kind === 'asking') {
    answers = (
      <div className="rmm-sheet flex h-full flex-col items-center justify-center gap-3 p-4 sm:flex-row">
        <button
          type="button"
          data-primary={heard ? undefined : ''}
          onClick={() => perform(send({ type: 'listen' }))}
          className={heard ? SECONDARY_BUTTON : PRIMARY_BUTTON}
        >
          {heard
            ? t('button-listen-again', { defaultValue: 'Listen again' })
            : t('button-listen', { defaultValue: 'Listen' })}
        </button>
        <button
          type="button"
          data-primary={heard ? '' : undefined}
          aria-disabled={!heard || undefined}
          aria-describedby={heard ? undefined : 'rmm-read-locked'}
          onClick={() => {
            if (heard) perform(send({ type: 'begin' }));
          }}
          className={heard ? PRIMARY_BUTTON : cn(SECONDARY_BUTTON, 'text-app-text-muted')}
        >
          {t('button-tap', { defaultValue: 'Tap it' })}
        </button>
        {heard ? null : (
          <span id="rmm-read-locked" className="sr-only">
            {t('button-tap-locked', { defaultValue: 'Listen to the rhythm first.' })}
          </span>
        )}
      </div>
    );
  } else {
    // Listening, or the count-in: the pad is not yet a pad.
    answers = (
      <div
        aria-busy="true"
        className="rmm-sheet rmm-display flex h-full items-center justify-center p-4 text-2xl text-app-text-muted"
      >
        {state.kind === 'listening'
          ? t('pad-listening', { defaultValue: 'Listening' })
          : t('pad-count-in', { defaultValue: 'Count in' })}
      </div>
    );
  }

  return (
    <SessionFrame className="rmm-rhythm space-y-4">
      <PracticeModeToggle />
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <h2 className="rmm-display min-h-8 text-2xl leading-8 text-app-text">
          <span key={title}>{title}</span>
        </h2>
        <div className="mx-auto w-full max-w-md">
          {pattern ? (
            <RhythmBar
              pattern={pattern}
              attempt={attempt}
              playing={state.kind === 'listening' ? playing : null}
              beat={beatNow}
            />
          ) : null}
        </div>
        <div className="flex min-h-16 flex-col items-center justify-center gap-1">
          {lines.map((line, i) => (
            <p key={`${state.kind}-${i}`} className="text-sm leading-5 break-words text-app-text-muted">
              {line}
            </p>
          ))}
          <p className="sr-only" aria-live="polite">
            {state.kind === 'tapping' || state.kind === 'listening' ? '' : <SaidParts parts={[title, ...lines]} />}
          </p>
        </div>
      </section>
      <div ref={answersBox} className="rmm-rhythm__answers">
        {answers}
      </div>
    </SessionFrame>
  );
}
