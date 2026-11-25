/**
 * StaffChordsLesson — reading a triad off the staff (`staff-chords`: Read a chord on the staff, Read
 * inversions): ten cards, each three notes written on one stem, and the buttons that name them. The
 * learner picks the root's letter and its sign (a flat, a natural or a sharp, natural to start with),
 * the quality and, in the inversion lesson, which inversion, then presses Check. Right means the
 * written root, the quality and (when asked) the inversion all match: F♯ A♯ C♯ is F♯ major, and F♯
 * is not G♭. On the piano path every other card is on the bass staff.
 *
 * What a card is, how it is written and the grading are `machines/staff-chords.ts`; the staff is the
 * sight reading sheet (`SprintSheet`). The lifecycle (asking, feedback, next, saving, saved / failed /
 * signed out; one save per attempt) is the shared session machine through `useQuestionSession`. Each
 * card is an image whose text alternative names the clef and the three notes ("Treble staff: F sharp,
 * A sharp, C sharp"), and every answer is a native button in a group, so the keyboard and a screen
 * reader reach them; the right choice is marked with a check and a wrong pick with a cross, never by
 * colour alone. Nothing moves at rest.
 */

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  createStaffChordsMachine,
  staffChordQuestions,
  staffChordsLesson,
  type StaffChordAnswer,
  type StaffChordQuestion,
  type StaffChordsLesson as StaffChordsSetting,
} from '@/lib/rmhmusic/learn/machines/staff-chords';
import { scoreFrom, starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import type { SheetNote } from '@/lib/rmhmusic/learn/staff-card-layout';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import type { ChordQuality, Inversion } from '@/lib/rmhmusic/learn/theory/chords';
import { noteLetter, type Clef } from '@/lib/rmhmusic/learn/theory/clef';
import { LETTERS, noteGlyphs, type Letter } from '@/lib/rmhmusic/learn/theory/scales';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON } from './buttons';
import { LessonResult } from './LessonParts';
import { SessionFrame, SessionSheet, cardStateOf, sessionTitle, useQuestionSession } from './QuestionSession';
import { SprintSheet } from './StaffCard';

type T = TFunction<'music-chords'>;

/** The root's sign as the answer buttons offer it, flat to sharp. */
const SIGNS = [-1, 0, 1] as const;
const INVERSIONS: readonly Inversion[] = [0, 1, 2];

/** A written note said in words: "F sharp", "B flat", "G". */
export function noteWords(t: T, n: SheetNote, letter: string): string {
  if (n.accidental > 0) return t('note-sharp', { letter, defaultValue: '{{letter}} sharp' });
  if (n.accidental < 0) return t('note-flat', { letter, defaultValue: '{{letter}} flat' });
  return letter;
}

/** The staff's name: "Treble staff", "Bass staff". */
export function staffWord(t: T, clef: Clef): string {
  return clef === 'treble'
    ? t('staff-treble', { defaultValue: 'Treble staff' })
    : t('staff-bass', { defaultValue: 'Bass staff' });
}

/**
 * The card's text alternative: the staff and its three notes, lowest first ("Treble staff: F sharp,
 * A sharp, C sharp"). The list is joined as the reader's language joins a short list.
 */
export function chordCardLabel(t: T, language: string, clef: Clef, notes: readonly SheetNote[]): string {
  const words = notes.map((n) => noteWords(t, n, noteLetter(n.written)));
  let list: string;
  try {
    list = new Intl.ListFormat(language, { style: 'short', type: 'unit' }).format(words);
  } catch {
    list = words.join(', ');
  }
  return t('card-label', {
    staff: staffWord(t, clef),
    notes: list,
    defaultValue: '{{staff}}: {{notes}}',
  });
}

/** A quality's word. */
export function qualityWord(t: T, quality: ChordQuality): string {
  switch (quality) {
    case 'major':
      return t('quality-major', { defaultValue: 'major' });
    case 'minor':
      return t('quality-minor', { defaultValue: 'minor' });
    case 'diminished':
      return t('quality-diminished', { defaultValue: 'diminished' });
    case 'augmented':
      return t('quality-augmented', { defaultValue: 'augmented' });
  }
}

/** An inversion's name. */
export function inversionWord(t: T, inversion: Inversion): string {
  switch (inversion) {
    case 0:
      return t('inversion-root', { defaultValue: 'Root position' });
    case 1:
      return t('inversion-first', { defaultValue: 'First inversion' });
    case 2:
      return t('inversion-second', { defaultValue: 'Second inversion' });
  }
}

/** An inversion said inside a sentence, lower case: "first inversion". */
function inversionPhrase(t: T, inversion: Inversion): string {
  switch (inversion) {
    case 0:
      return t('inversion-phrase-root', { defaultValue: 'root position' });
    case 1:
      return t('inversion-phrase-first', { defaultValue: 'first inversion' });
    case 2:
      return t('inversion-phrase-second', { defaultValue: 'second inversion' });
  }
}

/** The chord's name as the feedback says it: "F♯ major", and ", first inversion" when the lesson asks it. */
export function chordName(t: T, q: StaffChordQuestion, withInversion: boolean): string {
  const name = t('chord-name', {
    root: noteGlyphs(q.root),
    quality: qualityWord(t, q.quality),
    defaultValue: '{{root}} {{quality}}',
  });
  return withInversion
    ? t('chord-name-inversion', {
        chord: name,
        inversion: inversionPhrase(t, q.inversion),
        defaultValue: '{{chord}}, {{inversion}}',
      })
    : name;
}

/** The sign's glyph and its word for a screen reader. */
function signLabel(t: T, sign: (typeof SIGNS)[number]): { glyph: string; word: string } {
  return sign > 0
    ? { glyph: '♯', word: t('sign-sharp', { defaultValue: 'sharp' }) }
    : sign < 0
      ? { glyph: '♭', word: t('sign-flat', { defaultValue: 'flat' }) }
      : { glyph: '♮', word: t('sign-natural', { defaultValue: 'natural' }) };
}

const CHOICE =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-app-sm border px-3 text-base font-medium text-app-text transition-colors';

export function StaffChordsLesson({ lessonId, paused = false }: { lessonId: string; paused?: boolean }) {
  const setting = staffChordsLesson(lessonId);
  if (!setting) return null;
  return <StaffChordsSession lessonId={lessonId} setting={setting} paused={paused} />;
}

function StaffChordsSession({
  lessonId,
  setting,
  paused,
}: {
  lessonId: string;
  setting: StaffChordsSetting;
  paused: boolean;
}) {
  const { t, i18n } = useTranslation('music-chords');
  // The bass staff is the piano's: a guitarist reads the treble clef.
  const bass = useLearnStore((s) => (s.profile?.instrument ?? 'piano') === 'piano');
  const [questions] = useState(() => staffChordQuestions(lessonId, { bass }));
  const session = useQuestionSession<StaffChordQuestion, StaffChordAnswer>({
    machine: () => createStaffChordsMachine(questions, setting),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: 'button[data-choice]',
  });
  const { lesson, total, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const card = session.card;
  const asking = lesson.kind === 'asking';
  const label = card ? chordCardLabel(t, i18n.language, card.clef, card.notes) : '';

  const title = sessionTitle(
    session,
    inSession ? t('chord-read-count', { n: lesson.index + 1, total, defaultValue: 'Chord {{n}} of {{total}}' }) : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  let line: string;
  let lineKey = 'hint';
  if (lesson.kind === 'feedback' && card) {
    lineKey = `fb-${lesson.index}`;
    const name = chordName(t, card, setting.inversions);
    line = lesson.right
      ? t('chord-read-right', { name, defaultValue: 'Right: {{name}}.' })
      : t('chord-read-not-quite', { name, defaultValue: 'Not quite: that is {{name}}.' });
  } else if (!inSession) {
    lineKey = 'score';
    line = t('chord-read-score', {
      correct: lesson.correct,
      total,
      count: Number(total),
      defaultValue_one: 'You named {{correct}} of {{total}} chord.',
      defaultValue: 'You named {{correct}} of {{total}} chords.',
    });
  } else {
    line = setting.inversions
      ? t('chord-read-hint-inversion', {
          defaultValue: 'Find the root, the note the other two stack on in thirds, then see which note is lowest.',
        })
      : t('chord-read-hint', {
          defaultValue: 'Find the root, the note the other two stack on in thirds, then pick the kind of chord.',
        });
  }
  const said = asking ? (session.announce ? `${title}. ${label}` : '') : line;

  if (!inSession) {
    const stars = lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
    return (
      <SessionFrame className="space-y-4">
        <SessionSheet
          session={session}
          title={title}
          question={<div className="min-h-40" />}
          line={line}
          lineKey={lineKey}
          said={said}
        />
        <div ref={session.answersBox}>
          <LessonResult
            kind={lesson.kind}
            stars={stars}
            returnTo={`/rmhmusic/lesson/${lessonId}`}
            onRetry={session.retry}
            className="flex-1"
          />
        </div>
      </SessionFrame>
    );
  }

  const given = lesson.kind === 'feedback' ? lesson.answer : null;
  return (
    <SessionFrame className="space-y-4">
      <SessionSheet
        session={session}
        title={title}
        question={
          card ? (
            <SprintSheet
              clef={card.clef}
              notes={card.notes}
              arrangement="chord"
              state={cardStateOf(session)}
              label={label}
            />
          ) : null
        }
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <div ref={answerGroup}>
        {/* Keyed by the question so a new card starts with nothing picked. */}
        <ChordChoices
          key={lesson.index}
          setting={setting}
          card={card}
          given={given}
          asking={asking}
          onCheck={session.answer}
        />
      </div>
    </SessionFrame>
  );
}

function ChordChoices({
  setting,
  card,
  given,
  asking,
  onCheck,
}: {
  setting: StaffChordsSetting;
  card: StaffChordQuestion | null;
  given: StaffChordAnswer | null;
  asking: boolean;
  onCheck: (a: StaffChordAnswer) => void;
}) {
  const { t } = useTranslation('music-chords');
  const [letter, setLetter] = useState<Letter | null>(null);
  const [sign, setSign] = useState<(typeof SIGNS)[number]>(0);
  const [quality, setQuality] = useState<ChordQuality | null>(null);
  const [inversion, setInversion] = useState<Inversion | null>(null);
  const ready = letter !== null && quality !== null && (!setting.inversions || inversion !== null);

  // Once answered, the answer the learner gave and the right one are what is marked.
  const shown = {
    letter: given ? given.letter : letter,
    sign: given ? given.accidental : sign,
    quality: given ? given.quality : quality,
    inversion: given ? (given.inversion ?? null) : inversion,
  };

  const mark = (pressed: boolean, right: boolean) =>
    asking
      ? cn(pressed ? 'border-app-accent bg-app-surface-hover' : 'border-app-border-bright hover:bg-app-surface-hover')
      : right
        ? 'border-app-accent'
        : pressed
          ? 'border-app-danger'
          : 'border-app-border text-app-text-muted';
  const marks = (pressed: boolean, right: boolean) =>
    asking ? null : right ? (
      <>
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t('choice-right', { defaultValue: 'right answer' })}</span>
      </>
    ) : pressed ? (
      <>
        <X className="h-4 w-4 shrink-0 text-app-danger" aria-hidden="true" />
        <span className="sr-only">{t('choice-wrong', { defaultValue: 'your answer, not right' })}</span>
      </>
    ) : null;

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={t('choices-letter', { defaultValue: 'Root note' })}
        className="flex flex-wrap justify-center gap-2"
      >
        {LETTERS.map((l, i) => (
          <button
            key={l}
            type="button"
            data-choice={i === 0 ? '' : undefined}
            aria-pressed={shown.letter === l}
            aria-disabled={!asking || undefined}
            onClick={() => asking && setLetter(l)}
            className={cn(CHOICE, mark(shown.letter === l, !asking && card?.root.letter === l))}
          >
            <span dir="ltr">{l}</span>
            {marks(shown.letter === l, !asking && card?.root.letter === l)}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label={t('choices-sign', { defaultValue: 'Sharp or flat' })}
        className="flex flex-wrap justify-center gap-2"
      >
        {SIGNS.map((s) => {
          const { glyph, word } = signLabel(t, s);
          const right = !asking && card?.root.accidental === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={shown.sign === s}
              aria-disabled={!asking || undefined}
              onClick={() => asking && setSign(s)}
              className={cn(CHOICE, mark(shown.sign === s, right))}
            >
              <span aria-hidden="true">{glyph}</span>
              <span className="sr-only">{word}</span>
              {marks(shown.sign === s, right)}
            </button>
          );
        })}
      </div>
      <div
        role="group"
        aria-label={t('choices-quality', { defaultValue: 'Kind of chord' })}
        className="grid grid-cols-2 gap-2"
      >
        {setting.qualities.map((q) => {
          const right = !asking && card?.quality === q;
          return (
            <button
              key={q}
              type="button"
              aria-pressed={shown.quality === q}
              aria-disabled={!asking || undefined}
              onClick={() => asking && setQuality(q)}
              className={cn(CHOICE, mark(shown.quality === q, right))}
            >
              {qualityWord(t, q)}
              {marks(shown.quality === q, right)}
            </button>
          );
        })}
      </div>
      {setting.inversions ? (
        <div
          role="group"
          aria-label={t('choices-inversion', { defaultValue: 'Inversion' })}
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {INVERSIONS.map((v) => {
            const right = !asking && card?.inversion === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={shown.inversion === v}
                aria-disabled={!asking || undefined}
                onClick={() => asking && setInversion(v)}
                className={cn(CHOICE, mark(shown.inversion === v, right))}
              >
                {inversionWord(t, v)}
                {marks(shown.inversion === v, right)}
              </button>
            );
          })}
        </div>
      ) : null}
      {asking ? (
        <div className="flex justify-center">
          <button
            type="button"
            aria-disabled={!ready || undefined}
            onClick={() => {
              if (!ready || letter === null || quality === null) return;
              onCheck({
                letter,
                accidental: sign,
                quality,
                ...(setting.inversions && inversion !== null ? { inversion } : {}),
              });
            }}
            className={PRIMARY_BUTTON}
          >
            {t('check', { defaultValue: 'Check' })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
