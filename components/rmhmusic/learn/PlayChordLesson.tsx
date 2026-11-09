'use client';

/**
 * PlayChordLesson — playing a chord (`play-chord`: Play a C major chord): three major chords, each
 * asked by name, played on the on-screen keys, the computer keys or a MIDI controller. The notes
 * of one chord arrive as separate events, so the first note opens a 600 ms window and the notes
 * inside it are the answer (`input/chord-window.ts`); right means exactly the chord's pitch
 * classes, in any octave, order or inversion (`theory/chords.ts`, `machines/play-chord.ts`).
 *
 * The microphone hears one note at a time, so it can never play a chord. With the microphone as
 * the input the lesson says so in one plain sentence and offers to switch input (the same setup
 * dialog as "Change input"); the microphone is not started and its notes are ignored, so a
 * microphone player is never marked wrong for a chord.
 *
 * The notes are heard through the same note sound as every lesson (`useNoteSound`); this file makes
 * no sound of its own. Every box — the title line, the chord's name, the sentence line, the input
 * region — has a fixed height, the same as LessonScreen's PlayChordSkeleton.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CHORD_WINDOW_MS, createChordWindow } from '@/lib/rmhmusic/learn/input/chord-window';
import {
  createPlayChordMachine,
  playChordQuestions,
  type ChordAnswer,
  type ChordQuestion,
} from '@/lib/rmhmusic/learn/machines/play-chord';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { scoreFrom, starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { noteLetter } from '@/lib/rmhmusic/learn/theory/clef';
import { chordNotes, type ChordQuality } from '@/lib/rmhmusic/learn/theory/chords';
import { TEXT_BUTTON } from './buttons';
import { DeviceRegion, LessonResult } from './LessonParts';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { SessionFrame, SessionSheet, sessionTitle, useQuestionSession } from './QuestionSession';
import { useInputPhases, useLessonInputStart, useNoteEvents, useNoteSound } from './useLearnInput';

export function PlayChordLesson({
  lessonId,
  paused = false,
  onChangeInput,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
  /** Open the input setup dialog (the lesson's "Change input"). */
  onChangeInput?: () => void;
}) {
  const { t, i18n } = useTranslation('c-rmhmusic');
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const [questions] = useState(() => playChordQuestions(lessonId));
  const session = useQuestionSession<ChordQuestion, ChordAnswer>({
    machine: () => createPlayChordMachine(questions),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: '.rmm-keys__bed button:not([tabindex="-1"]), [data-focus-first]',
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const index = inSession ? lesson.index : -1;
  const asking = lesson.kind === 'asking';
  const phases = useInputPhases();
  useNoteSound(!paused);
  // The microphone cannot play a chord: this lesson never starts it.
  useLessonInputStart({ mic: false });

  // The chord window: the first note of a chord opens it, the timer closes it and answers.
  const [chordWindow] = useState(() => createChordWindow());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  });
  useNoteEvents((e) => {
    if (paused || !asking || input === 'mic') return;
    if (chordWindow.push(e) !== 'opened') return;
    timer.current = setTimeout(() => {
      timer.current = null;
      answerRef.current({ midis: chordWindow.take() });
    }, CHORD_WINDOW_MS);
  });
  // A new chord, a dialog, or leaving: whatever was being collected is dropped.
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      chordWindow.reset();
    };
  }, [index, paused, chordWindow]);

  const question = session.card;
  const names = (midis: readonly number[]) => listOf(i18n.language, midis.map(noteLetter));
  const chordName = question ? chordLabel(t, question) : '';
  const notes = question ? names(chordNotes(question.root, question.quality)) : '';

  const title = sessionTitle(
    session,
    inSession
      ? t('chord-count', { n: lesson.index + 1, total, defaultValue: 'Chord {{n}} of {{total}}' })
      : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  let line = '';
  let lineKey = 'hint';
  if (lesson.kind === 'asking') {
    line =
      input === 'screen'
        ? t('chord-hint-screen', {
            notes,
            defaultValue: 'Tap {{notes}} together: use several fingers, or tap quickly.',
          })
        : t('chord-hint', { notes, defaultValue: 'Play {{notes}} together.' });
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    if (!lesson.right) {
      line = t('chord-not-quite', {
        played: listOf(
          i18n.language,
          lesson.answer.midis.map((m) => midiToName(m)),
        ),
        defaultValue: 'Not quite: you played {{played}}.',
      });
    }
  } else {
    lineKey = 'score';
    line = t('chord-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You played {{correct}} of {{total}} chords.',
    });
  }
  const said =
    lesson.kind === 'feedback'
      ? lesson.right
        ? t('chord-right-sr', { name: chordName, defaultValue: 'Right: {{name}}.' })
        : line
      : lesson.kind === 'asking'
        ? session.announce
          ? `${title}. ${chordName}.`
          : ''
        : inSession
          ? ''
          : line;

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
  } else if (input === 'mic') {
    answers = (
      <div
        ref={answerGroup}
        className="rmm-sheet flex h-full flex-col items-center justify-center gap-1 p-4 text-center"
      >
        <p className="text-sm leading-6 text-(--app-text-muted)">
          {t('chord-mic', {
            defaultValue: 'The microphone hears one note at a time, so it cannot hear a chord.',
          })}
        </p>
        <button type="button" data-focus-first="" onClick={onChangeInput} className={TEXT_BUTTON}>
          {t('chord-change-input', { defaultValue: 'Change input' })}
        </button>
      </div>
    );
  } else if (input === 'midi') {
    answers = (
      <div ref={answerGroup} className="h-full">
        <div
          tabIndex={-1}
          data-focus-first=""
          role="group"
          aria-label={t('chord-region', { defaultValue: 'Where you play' })}
          className="h-full"
        >
          <DeviceRegion input="midi" on={phases.midi === 'active'} />
        </div>
      </div>
    );
  } else if (input === 'keys') {
    answers = (
      <div ref={answerGroup} className="h-full">
        <div
          tabIndex={-1}
          data-focus-first=""
          role="group"
          aria-label={t('chord-region', { defaultValue: 'Where you play' })}
          className="rmm-sheet flex h-full items-center justify-center p-4 text-center"
        >
          <p className="text-sm leading-6 text-(--app-text-muted)">
            {t('flash-keys-region', {
              defaultValue:
                'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
            })}
          </p>
        </div>
      </div>
    );
  } else {
    answers = (
      <div ref={answerGroup} className="h-full">
        <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />
      </div>
    );
  }

  return (
    <SessionFrame className="rmm-chord space-y-4">
      <SessionSheet
        session={session}
        title={title}
        question={<ChordNameBox name={inSession ? chordName : ''} />}
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <div ref={session.answersBox} className="rmm-input-region">
        {answers}
      </div>
    </SessionFrame>
  );
}

/** The chord to play, written large: one box of a fixed height (the placeholder's too). */
export function ChordNameBox({ name, skeleton = false }: { name?: string; skeleton?: boolean }) {
  return (
    <div className="flex h-24 items-center justify-center">
      {skeleton ? (
        <div className="app-skeleton h-10 w-48 max-w-full" aria-hidden="true" />
      ) : (
        <p className="rmm-display text-[2.5rem] leading-[3rem] text-(--app-text)">{name}</p>
      )}
    </div>
  );
}

/** Words joined as the language joins a list ("C, E and G"). */
function listOf(language: string, items: readonly string[]): string {
  try {
    return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** "C major": the root's letter and the quality's word, set in one key so languages can reorder. */
function chordLabel(t: TFunction<'c-rmhmusic'>, q: ChordQuestion): string {
  return t('chord-name', {
    root: noteLetter(q.root),
    quality: qualityName(t, q.quality),
    defaultValue: '{{root}} {{quality}}',
  });
}

/** A quality's word, one key each. */
export function qualityName(t: TFunction<'c-rmhmusic'>, quality: ChordQuality): string {
  switch (quality) {
    case 'major':
      return t('chord-quality-major', { defaultValue: 'major' });
    case 'minor':
      return t('chord-quality-minor', { defaultValue: 'minor' });
    case 'diminished':
      return t('chord-quality-diminished', { defaultValue: 'diminished' });
    case 'augmented':
      return t('chord-quality-augmented', { defaultValue: 'augmented' });
  }
}
