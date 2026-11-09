'use client';

/**
 * FindNoteLesson — the note finder (`keyboard-map`: Keyboard layout & open strings, `fretboard`:
 * First frets & two octaves): ten target notes, each shown as a name and on the staff, found on
 * the learner's instrument. It follows the profile's instrument:
 * - piano: the on-screen piano is the answer; the learner taps (or plays) that exact key. In the
 *   keyboard-layout lesson the hint places each white key by the black-key groups ("D sits between
 *   the two black keys").
 * - guitar: the fretboard (frets 0–5) is the answer; any string and fret that sounds the target is
 *   right, and so is playing it. The staff shows guitar music's WRITTEN pitch, an octave above the
 *   sounding one (the treble clef with its small 8): the open low E sounds E2 and sits on E3 under
 *   three ledger lines. The name is the sounding pitch (E2), and the microphone and MIDI report
 *   sounding pitch, so played notes match the name, not the staff position.
 *
 * Played notes (MIDI, computer keys, the microphone, and the on-screen keys on piano) answer by
 * the exact sounding pitch. The lifecycle (asking → feedback → next → saving → saved / failed /
 * signed-out, one answer per question, one save per attempt) is the shared session machine via
 * `useQuestionSession`, as in the flashcards, and so are the sheet, the focus moves and the
 * held-Enter guard (`QuestionSession.tsx`).
 *
 * Boxes: the sheet (title line, the staff card in its low range, the sentence line) and below it
 * the board (`.rmm-find__board`, one height on both instruments) and one input line, all fixed and
 * the same as LessonScreen's FindNoteSkeleton, so nothing moves from loading to the result. The
 * lesson needs no instrument: tapping always answers.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getLesson } from '@/lib/rmhmusic/learn/content/path';
import {
  FIND_NOTE_TARGETS,
  answerMidi,
  createFindNoteMachine,
  dealTargets,
  findNotePool,
  playHintFits,
  targetStaff,
  type Answer,
  type FindNoteMode,
  type Target,
} from '@/lib/rmhmusic/learn/machines/find-note';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { starsFor, scoreFrom } from '@/lib/rmhmusic/learn/scoring/stars';
import type { Instrument } from '@/lib/rmhmusic/learn/schemas';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { noteLetter, type NoteLetter } from '@/lib/rmhmusic/learn/theory/clef';
import {
  FIRST_FRETS,
  positionsOf,
  stringNumber,
  type FretPosition,
} from '@/lib/rmhmusic/learn/theory/fretboard';
import { cn } from '@/lib/utils';
import { TEXT_BUTTON } from './buttons';
import { FretboardView } from './FretboardView';
import { LessonResult } from './LessonParts';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import {
  SessionFrame,
  SessionSheet,
  cardStateOf,
  sessionTitle,
  useQuestionSession,
} from './QuestionSession';
import { STAFF_BOX, STAFF_LOW_ASPECT, StaffCard } from './StaffCard';
import {
  chooseInput,
  useInputPhases,
  useLessonInputStart,
  useNoteEvents,
  useNoteSound,
} from './useLearnInput';

/** The control focus returns to after Next: the fretboard's roving cell, or the first piano key. */
const FOCUS_FIRST: Record<Instrument, string> = {
  guitar: '.rmm-fret__cell[tabindex="0"]',
  piano: '.rmm-keys__bed button:not([tabindex="-1"])',
};

export function FindNoteLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  // Read once: the board and the targets are dealt for the instrument the lesson opened with.
  const [instrument] = useState<Instrument>(
    () => useLearnStore.getState().profile?.instrument ?? 'piano',
  );
  const mode: FindNoteMode =
    getLesson(lessonId)?.mode === 'fretboard' ? 'fretboard' : 'keyboard-map';
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const guitar = instrument === 'guitar';

  const session = useQuestionSession<Target, Answer>({
    machine: () =>
      createFindNoteMachine(
        dealTargets(findNotePool(mode, instrument), FIND_NOTE_TARGETS, Math.random),
      ),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: FOCUS_FIRST[instrument],
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const phases = useInputPhases();
  useNoteSound(!paused);
  useLessonInputStart();

  // Every played note answers by its sounding pitch (the on-screen piano included).
  useNoteEvents((e) => {
    if (e.type === 'on') answer({ kind: 'midi', midi: e.midi, tapped: e.source === 'screen' });
  });

  const target = session.card;
  const name = target ? midiToName(target.midi) : '';

  const title = sessionTitle(
    session,
    inSession
      ? t('find-count', { n: lesson.index + 1, total, defaultValue: 'Note {{n}} of {{total}}' })
      : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  // "Or play it" only where it is true: the computer keys reach C4 to C5, not the low notes.
  const plays = target ? playHintFits(input, target.midi) : input !== 'screen';
  const pianoGroupHint = (letter: NoteLetter): string => {
    switch (letter) {
      case 'C':
        return t('find-group-c', { defaultValue: 'C is just left of the two black keys.' });
      case 'D':
        return t('find-group-d', { defaultValue: 'D sits between the two black keys.' });
      case 'E':
        return t('find-group-e', { defaultValue: 'E is just right of the two black keys.' });
      case 'F':
        return t('find-group-f', { defaultValue: 'F is just left of the three black keys.' });
      case 'G':
        return t('find-group-g', {
          defaultValue: 'G sits between the first two of the three black keys.',
        });
      case 'A':
        return t('find-group-a', {
          defaultValue: 'A sits between the last two of the three black keys.',
        });
      default:
        return t('find-group-b', { defaultValue: 'B is just right of the three black keys.' });
    }
  };
  let hint: string;
  if (guitar) {
    hint =
      mode === 'keyboard-map'
        ? t('find-hint-open', {
            defaultValue: 'The open strings are the column left of the nut.',
          })
        : plays
          ? t('find-hint-guitar-play', { defaultValue: 'Find it on the fretboard, or play it.' })
          : t('find-hint-guitar', { defaultValue: 'Find it on the fretboard.' });
  } else if (mode === 'keyboard-map' && target) {
    hint = pianoGroupHint(noteLetter(target.midi));
  } else {
    hint = plays
      ? t('find-hint-piano-play', { defaultValue: 'Find that key, or play it.' })
      : t('find-hint-piano', { defaultValue: 'Find that key on the piano below.' });
  }

  // After a wrong answer: what was found (tapped or played), and where the target is — on guitar
  // the lowest place on the board that sounds it, on piano the key marked on the keyboard.
  const answered = lesson.kind === 'feedback' ? lesson.answer : null;
  const playedMidi = answered ? answerMidi(answered) : null;
  const rightPlaces: FretPosition[] =
    guitar && target && lesson.kind === 'feedback' ? positionsOf(target.midi, FIRST_FRETS) : [];
  let line = '';
  let lineKey = 'hint';
  if (lesson.kind === 'asking') {
    line = hint;
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    if (!lesson.right && target) {
      const played = playedMidi === null ? '?' : midiToName(playedMidi);
      const found =
        answered?.kind === 'position' || (answered?.kind === 'midi' && answered.tapped)
          ? t('find-that-is', { note: played, defaultValue: 'That is {{note}}.' })
          : t('first-note-played', { note: played, defaultValue: 'You played {{note}}.' });
      let where: string;
      if (guitar) {
        const place = [...rightPlaces].sort((a, b) => a.fret - b.fret)[0];
        where = !place
          ? ''
          : place.fret === 0
            ? t('find-where-open', {
                note: name,
                n: stringNumber(place.string),
                defaultValue: '{{note}} is string {{n}}, open.',
              })
            : t('find-where-fret', {
                note: name,
                n: stringNumber(place.string),
                fret: place.fret,
                defaultValue: '{{note}} is on string {{n}}, fret {{fret}}.',
              });
      } else {
        where = t('find-where-key', { note: name, defaultValue: '{{note}} is marked.' });
      }
      line = `${found} ${where}`.trim();
    }
  } else {
    lineKey = 'score';
    line = t('find-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You found {{correct}} of {{total}} notes.',
    });
  }

  const said =
    lesson.kind === 'feedback'
      ? lesson.right
        ? t('flash-right-sr', { note: name, defaultValue: 'Right: {{note}}.' })
        : line
      : lesson.kind === 'asking'
        ? session.announce
          ? `${title}. ${name}.`
          : ''
        : line;

  // The staff card: the target, drawn where its music is written, its name pencilled beside it.
  let question: ReactNode = null;
  if (target) {
    const staff = targetStaff(target.midi, instrument);
    const written = midiToName(staff.midi);
    const label = guitar
      ? t('find-staff-guitar', {
          note: name,
          written,
          defaultValue: '{{note}}, written as {{written}} on the treble staff',
        })
      : staff.clef === 'bass'
        ? t('flash-card-named-bass', { note: name, defaultValue: '{{note}} on the bass staff' })
        : t('flash-card-named-treble', {
            note: name,
            defaultValue: '{{note}} on the treble staff',
          });
    question = (
      <StaffCard
        card={{ id: `${instrument}:${target.midi}`, clef: staff.clef, midi: staff.midi }}
        state={cardStateOf(session)}
        range="low"
        octaveClef={guitar}
        caption={name}
        label={label}
      />
    );
  }

  let answers: ReactNode;
  if (!inSession) {
    const stars =
      lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
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
    const asking = lesson.kind === 'asking';
    const board = guitar ? (
      <FretboardView
        asking={asking}
        onAnswer={(p) => answer({ kind: 'position', string: p.string, fret: p.fret })}
        right={rightPlaces}
        wrong={
          lesson.kind === 'feedback' && !lesson.right && answered?.kind === 'position'
            ? answered
            : null
        }
        className="h-full"
      />
    ) : (
      <OnScreenKeyboard
        tall
        // The letters would give the answer away: the learner finds the key by its place.
        hideLabels
        // The two-octave lesson asks C3 to B4: open on C3, so a wide screen shows all of it.
        startOctave={mode === 'fretboard' ? 3 : 4}
        rightKey={lesson.kind === 'feedback' && target ? target.midi : null}
        wrongKey={lesson.kind === 'feedback' && !lesson.right ? playedMidi : null}
      />
    );
    answers = (
      <>
        {/* Under 360px the board bleeds into the page gutter, so six 44px frets (or seven 44px
            white keys) fit; wider, it lines up with the sheet above. */}
        <div ref={answerGroup} className="rmm-find__board max-[359px]:-mx-2 max-[332px]:-mx-3.5">
          {board}
        </div>
        <DeviceLine input={input} phase={input === 'screen' ? 'active' : phases[input]} />
      </>
    );
  }

  return (
    <SessionFrame className="rmm-find space-y-4">
      <SessionSheet
        session={session}
        title={title}
        question={question ?? <FindNoteStaffBox />}
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <div ref={session.answersBox} className="rmm-find__answers">
        {answers}
      </div>
    </SessionFrame>
  );
}

/** The staff card's box with nothing in it: the low card's aspect (its name is drawn inside it). */
export function FindNoteStaffBox({ skeleton = false }: { skeleton?: boolean }) {
  return (
    <div aria-hidden="true" className={STAFF_BOX}>
      <div className={cn(skeleton && 'app-skeleton', STAFF_LOW_ASPECT, 'w-full')} />
    </div>
  );
}

/**
 * The line under the board: what is being listened to, or a button that starts the mic or MIDI
 * (a click, which iOS needs to grant them). Nothing for the on-screen keys: the board is the input.
 */
export function DeviceLine({
  input,
  phase,
}: {
  input: 'screen' | 'keys' | 'mic' | 'midi';
  phase: 'idle' | 'starting' | 'active' | 'stopping';
}) {
  const { t } = useTranslation('c-rmhmusic');
  const [failed, setFailed] = useState(false);
  let body: ReactNode = null;
  if (input === 'keys') {
    body = t('find-keys-line', { defaultValue: 'Keys A to K on your computer play C4 to C5.' });
  } else if (input === 'mic' || input === 'midi') {
    if (phase === 'active') {
      body =
        input === 'mic'
          ? t('first-note-listening-mic', { defaultValue: 'Listening to your microphone.' })
          : t('first-note-listening-midi', {
              defaultValue: 'Listening to your MIDI controller.',
            });
    } else if (phase === 'starting') {
      body = t('input-starting', { defaultValue: 'Starting…' });
    } else if (failed) {
      body = t('find-start-failed', {
        defaultValue: "Couldn't start it. Change input shows why.",
      });
    } else {
      body = (
        <button
          type="button"
          className={TEXT_BUTTON}
          onClick={() => {
            void chooseInput(input).then((ok) => setFailed(!ok));
          }}
        >
          {input === 'mic'
            ? t('find-start-mic', { defaultValue: 'Turn on the microphone' })
            : t('find-start-midi', { defaultValue: 'Connect your MIDI controller' })}
        </button>
      );
    }
  }
  return (
    <div className="rmm-find__device flex items-center justify-center text-center">
      {typeof body === 'string' ? (
        <p className="line-clamp-2 text-sm leading-5 text-(--app-text-muted)">{body}</p>
      ) : (
        body
      )}
    </div>
  );
}
