'use client';

/**
 * MatchNoteLesson — the pitch match (`match-note`: Match middle C, Match white keys): ten target
 * notes on the staff, each played back on whatever the learner plays with — the on-screen piano
 * (always there, so no device is needed), the computer keys, a MIDI controller or the microphone.
 * Three tries a target; the best counts (`machines/match-note.ts`, `scoring/pitch.ts`).
 *
 * - "Hear it" (a text button under the staff) sounds the target as a hint: never a try, as often
 *   as wanted. If the audio context cannot start (blocked, suspended past its timeout, or no Web
 *   Audio) a plain sentence says so on the sheet's line and the next tap tries again; the lesson
 *   never waits on it. While the hint sounds (and a short tail after it), microphone notes are
 *   dropped, so the speaker playing the hint is never taken for the learner's try.
 * - The result of each try is one sentence on the sheet's line. The microphone reports cents, so
 *   a close note is "a little flat" or "sharp"; every other source plays exact pitches and is
 *   simply spot on or a wrong note (a different octave is named as such). After a spot-on try or
 *   the third, the target's outcome stays with Next.
 * - Guitar learners: the hub reports sounding pitch, which is what is matched and named; the staff
 *   shows guitar music's written pitch an octave up, with the treble clef's small 8 (as in the
 *   note finder, `targetStaff`).
 *
 * The lifecycle, the sheet, the focus moves and the held-Enter guard are the shared session parts
 * (`QuestionSession.tsx`). Boxes: the sheet (title line, the staff card in the decks' range —
 * C4 to G4 and C4 to C5, or guitar's written C5 to C6, need no more than two ledger lines — the Hear-it row, the
 * sentence line) and below it the keys (`.rmm-input-region`) and one input line, all fixed and
 * the same as LessonScreen's MatchNoteSkeleton.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { playNote } from '@/lib/rmhmusic/learn/audio/voice';
import { resumeAudio } from '@/lib/rmhmusic/learn/audio/resume';
import { dealTargets, targetStaff } from '@/lib/rmhmusic/learn/machines/find-note';
import {
  MATCH_TARGETS,
  createMatchNoteMachine,
  matchNotePool,
  type Effect,
  type Played,
  type State,
  type Target,
} from '@/lib/rmhmusic/learn/machines/match-note';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { pitchVerdict, type PlayedPitch } from '@/lib/rmhmusic/learn/scoring/pitch';
import { starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import type { Instrument } from '@/lib/rmhmusic/learn/schemas';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';
import { cn } from '@/lib/utils';
import { TEXT_BUTTON } from './buttons';
import { DeviceLine } from './FindNoteLesson';
import { LessonResult } from './LessonParts';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import {
  SessionFrame,
  SessionSheet,
  cardStateOf,
  sessionTitle,
  useQuestionSession,
} from './QuestionSession';
import { STAFF_BOX, StaffCard } from './StaffCard';
import { useInputPhases, useLessonInputStart, useNoteEvents, useNoteSound } from './useLearnInput';

/** How long the hint sounds. */
const HEAR_MS = 900;
/** After the hint, how long the microphone may still be hearing the room's echo of it. */
const HEAR_TAIL_MS = 400;

type Sound = 'ok' | 'waking' | 'blocked' | 'none';

export function MatchNoteLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  // Read once: the staff is drawn for the instrument the lesson opened with.
  const [instrument] = useState<Instrument>(
    () => useLearnStore.getState().profile?.instrument ?? 'piano',
  );
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const guitar = instrument === 'guitar';
  // How the last Hear it went, and where in the lesson (`position`): a problem is said only until
  // the learner moves on.
  const [sound, setSound] = useState<{ kind: Sound; at: string }>({ kind: 'ok', at: '' });
  // Microphone notes before this time (performance.now() ms) are the hint, not the learner.
  const hintUntil = useRef(0);
  // Hints still sounding: each one's release, called by its timer or when the target changes.
  const hints = useRef(new Map<ReturnType<typeof setTimeout>, () => void>());

  const session = useQuestionSession<Target, Played, State, { type: 'hear' }, Effect>({
    machine: () =>
      createMatchNoteMachine(dealTargets(matchNotePool(lessonId), MATCH_TARGETS, Math.random)),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: '.rmm-keys__bed button:not([tabindex="-1"])',
    onEffect: (fx) => {
      if (fx.type !== 'play') return;
      hintUntil.current = performance.now() + HEAR_MS + HEAR_TAIL_MS;
      const release = playNote(fx.midi);
      const timer = setTimeout(() => {
        hints.current.delete(timer);
        release();
      }, HEAR_MS);
      hints.current.set(timer, release);
    },
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const phases = useInputPhases();
  useNoteSound(!paused);
  useLessonInputStart();

  // A new target (or the end): the last target's hint stops now, so the microphone is deaf to it
  // for the tail only, never to the learner's first note of the next one; and on unmount.
  const index = inSession ? lesson.index : -1;
  useEffect(() => {
    const live = hints.current;
    const stop = () => {
      if (live.size === 0) return;
      for (const [timer, release] of live) {
        clearTimeout(timer);
        release();
      }
      live.clear();
      hintUntil.current = Math.min(hintUntil.current, performance.now() + HEAR_TAIL_MS);
    };
    stop();
    return stop;
  }, [index]);

  useNoteEvents((e) => {
    if (e.source === 'mic' && e.time < hintUntil.current) return;
    // Only the microphone measures cents; every other source plays exact pitches.
    answer({
      type: e.type,
      midi: e.midi,
      time: e.time,
      ...(e.source === 'mic' && e.cents !== undefined ? { cents: e.cents } : {}),
    });
  });

  // Where the learner is: the target and how many tries it has had (a problem with the sound is
  // said here until this changes).
  const position = inSession
    ? `${lesson.kind}-${lesson.index}-${lesson.kind === 'asking' ? lesson.tries.length : 'fb'}`
    : lesson.kind;

  // Hear it: sound the target, waking the audio context first (inside this tap) if it sleeps.
  const hear = () => {
    const at = position;
    const ctx = getAudioContext();
    if (!ctx) {
      setSound({ kind: 'none', at });
      return;
    }
    if (ctx.state === 'running') {
      setSound({ kind: 'ok', at });
      session.send({ type: 'hear' });
      return;
    }
    setSound({ kind: 'waking', at });
    void resumeAudio(ctx).then((ok) => {
      setSound({ kind: ok ? 'ok' : 'blocked', at });
      if (ok) session.send({ type: 'hear' });
    });
  };

  const target = session.card;
  const name = target ? midiToName(target.midi) : '';

  const title = sessionTitle(
    session,
    inSession
      ? t('match-count', { n: lesson.index + 1, total, defaultValue: 'Note {{n}} of {{total}}' })
      : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  /** One try, in a sentence. */
  const verdictLine = (played: PlayedPitch): string => {
    if (!target) return '';
    const v = pitchVerdict(target.midi, played);
    const note = midiToName(v.heard);
    switch (v.kind) {
      case 'spot-on':
        return t('match-spot-on', { defaultValue: 'Spot on.' });
      case 'a-little-flat':
        return t('match-little-flat', { defaultValue: 'Close: a little flat.' });
      case 'a-little-sharp':
        return t('match-little-sharp', { defaultValue: 'Close: a little sharp.' });
      case 'flat':
        return t('match-flat', { defaultValue: 'Quite flat: bring it up.' });
      case 'sharp':
        return t('match-sharp', { defaultValue: 'Quite sharp: bring it down.' });
      case 'octave':
        return t('match-octave', { note, defaultValue: 'Wrong octave: that was {{note}}.' });
      default:
        return t('match-wrong', { note, defaultValue: 'Not quite: that was {{note}}.' });
    }
  };

  let line: string;
  let lineKey = 'hint';
  let heardMidi: number | null = null;
  if (lesson.kind === 'asking') {
    const last = lesson.tries[lesson.tries.length - 1];
    if (!last) {
      line =
        input === 'screen'
          ? t('match-hint-screen', { defaultValue: 'Play the note you see on the keys below.' })
          : t('match-hint', { defaultValue: 'Play the note you see.' });
    } else {
      lineKey = `try-${lesson.index}-${lesson.tries.length}`;
      const left =
        lesson.tries.length === 1
          ? t('match-left-two', { defaultValue: 'Two tries left.' })
          : t('match-left-one', { defaultValue: 'One try left.' });
      line = `${verdictLine(last)} ${left}`;
    }
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    if (target) heardMidi = pitchVerdict(target.midi, lesson.answer).heard;
    line = lesson.right
      ? t('match-spot-on', { defaultValue: 'Spot on.' })
      : lesson.best > 0
        ? t('match-out-close', { defaultValue: 'Out of tries, but your best was close.' })
        : t('match-out', { defaultValue: 'Out of tries: hear it, then go on.' });
  } else {
    lineKey = 'score';
    line = t('match-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You matched {{correct}} of {{total}} notes.',
    });
  }

  // A Hear it that could not sound takes the sentence line (a fixed box, so nothing moves) until
  // the learner plays or moves on.
  let soundLine = '';
  if (sound.at === position && sound.kind === 'blocked') {
    soundLine = t('match-sound-blocked', {
      defaultValue: "Sound didn't start. Tap Hear it again.",
    });
  } else if (sound.at === position && sound.kind === 'none') {
    soundLine = t('match-sound-none', { defaultValue: "This browser can't play sound." });
  }
  if (soundLine) {
    line = soundLine;
    lineKey = `sound-${position}`;
  }

  const said = soundLine
    ? soundLine
    : lesson.kind === 'asking'
      ? lesson.tries.length > 0
        ? line
        : session.announce
          ? `${title}. ${name}.`
          : ''
      : line;

  let question: ReactNode = <MatchStaffBox />;
  if (target) {
    const staff = targetStaff(target.midi, instrument);
    const written = midiToName(staff.midi);
    const label = guitar
      ? t('find-staff-guitar', {
          note: name,
          written,
          defaultValue: '{{note}}, written as {{written}} on the treble staff',
        })
      : t('flash-card-named-treble', { note: name, defaultValue: '{{note}} on the treble staff' });
    question = (
      <StaffCard
        card={{ id: `${instrument}:${target.midi}`, clef: staff.clef, midi: staff.midi }}
        state={cardStateOf(session)}
        octaveClef={guitar}
        caption={name}
        label={label}
      />
    );
  }

  let answers: ReactNode;
  if (!inSession) {
    const stars = lesson.kind === 'saved' ? lesson.stars : starsFor(lesson.score);
    answers = (
      <LessonResult
        kind={lesson.kind}
        stars={stars}
        returnTo={`/rmhmusic/lesson/${lessonId}`}
        onRetry={session.retry}
        className="flex-1"
      />
    );
  } else {
    const fb = lesson.kind === 'feedback';
    answers = (
      <>
        <div ref={answerGroup} className="rmm-input-region">
          <OnScreenKeyboard
            rightKey={fb && target ? target.midi : null}
            wrongKey={fb && !lesson.right ? heardMidi : null}
          />
        </div>
        <DeviceLine input={input} phase={input === 'screen' ? 'active' : phases[input]} />
      </>
    );
  }

  return (
    <SessionFrame className="rmm-match space-y-4">
      <SessionSheet
        session={session}
        title={title}
        question={
          <>
            {question}
            {/* Hidden (and inert) once the session is over, so the sheet keeps its height. */}
            <div
              className={cn('flex h-11 items-center justify-center', !inSession && 'invisible')}
              inert={!inSession || undefined}
            >
              <button type="button" onClick={hear} className={TEXT_BUTTON}>
                {t('match-hear', { defaultValue: 'Hear it' })}
              </button>
            </div>
          </>
        }
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <div ref={session.answersBox} className="rmm-match__answers">
        {answers}
      </div>
    </SessionFrame>
  );
}

/** The staff card's box with nothing in it: the decks' card aspect (its name is drawn inside it). */
export function MatchStaffBox({ skeleton = false }: { skeleton?: boolean }) {
  return (
    <div aria-hidden="true" className={STAFF_BOX}>
      <div className={cn(skeleton && 'app-skeleton', 'aspect-[200/102] w-full')} />
    </div>
  );
}
