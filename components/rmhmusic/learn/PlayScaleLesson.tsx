/**
 * PlayScaleLesson — playing a scale (`play-scale`: Play C, G, D and F major; Every major scale;
 * Natural minor scales): a few scales, each asked by name ("G major, one octave up"). The learner
 * plays its eight notes one after another and the lesson grades them in order
 * (`machines/play-scale.ts`): each note is held against the scale's note for that place, by pitch
 * class and direction (the exact pitch on piano, any octave on guitar). A wrong note is marked
 * and the learner carries on with the next one; the scale is right only when all eight are. One
 * scale is one answer to the session machine.
 *
 * Piano plays on the on-screen keys, the computer keys or a MIDI controller and sees the
 * right-hand fingering for the white-key majors. Guitar sees one position on the fretboard (dots
 * on the first five frets, lowest first), taps it or plays any way the input hears: the
 * microphone and MIDI report the pitch, and the octave is free. A played note is shown under the
 * name with the scale's own spelling (F sharp in G major, B flat in F major) whatever the input
 * called it, and its mark is a check or a cross as well as a colour; the live region says each
 * note as it is played.
 */

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { PlayOptions } from '@/lib/rmhmusic/learn/audio/voice';
import {
  SCALE_NOTE_COUNT,
  createPlayScaleMachine,
  fingering,
  gradeScale,
  guitarPosition,
  playScaleQuestions,
  type NoteMark,
  type ScaleAnswer,
  type ScaleInstrument,
  type ScaleQuestion,
} from '@/lib/rmhmusic/learn/machines/play-scale';
import { isolateLtr, noteList } from '@/lib/rmhmusic/learn/note-list';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { scoreFrom, starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { inKeysRange } from '@/lib/rmhmusic/learn/input/keyboard-map';
import { fretMidi } from '@/lib/rmhmusic/learn/theory/fretboard';
import { noteGlyphs, pitchClass, scaleMidis, scaleRun, type SpelledNote } from '@/lib/rmhmusic/learn/theory/scales';
import { cn } from '@/lib/utils';
import { FretboardView } from './FretboardView';
import { DeviceRegion, LessonResult } from './LessonParts';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { SaidParts, SessionFrame, SessionSheet, sessionTitle, useQuestionSession } from './QuestionSession';
import { useInputPhases, useLessonInputStart, useNoteEvents, useNoteSound } from './useLearnInput';

/** What the learner has played of the scale on screen, and for which scale. */
interface Played {
  index: number;
  midis: number[];
}

/**
 * A played note as it is printed: the scale's own spelling when it is the pitch class that place
 * wants (so a MIDI keyboard's black key reads F♯ in G major and B♭ in F major), else a sharp name.
 */
export function playedName(midi: number, expected: SpelledNote | undefined): string {
  if (expected && pitchClass(expected) === ((midi % 12) + 12) % 12) return noteGlyphs(expected);
  return midiToName(midi)
    .replace(/-?\d+$/, '')
    .replace('#', '♯');
}

function kindWord(t: TFunction<'music-scales'>, q: ScaleQuestion): string {
  return q.kind === 'major'
    ? t('scale-kind-major', {
        defaultValue: 'major',
      })
    : t('scale-kind-minor', {
        defaultValue: 'natural minor',
      });
}

function scaleName(t: TFunction<'music-scales'>, q: ScaleQuestion): string {
  return t('scale-name', {
    tonic: isolateLtr(noteGlyphs(q.tonic)),
    kind: kindWord(t, q),
    defaultValue: '{{tonic}} {{kind}}',
  });
}

/** The eight places of the scale: empty, then the name of each note played with its mark. */
export function ScaleSlots({ question, midis }: { question: ScaleQuestion; midis: readonly number[] }) {
  const { t } = useTranslation('music-scales');
  const run = scaleRun(question.tonic, question.kind);
  const marks = gradeScale(question, midis);
  return (
    <ol
      className="flex min-h-14 flex-wrap items-center justify-center gap-x-2 gap-y-1"
      aria-label={t('scale-slots', {
        defaultValue: 'Notes you have played',
      })}
    >
      {run.map((expected, i) => {
        const midi = midis[i];
        const mark: NoteMark | undefined = marks[i];
        return (
          <li
            key={i}
            className={cn(
              'flex h-12 w-10 flex-col items-center justify-center border-b text-sm',
              mark === 'wrong' ? 'border-app-danger text-app-danger' : 'border-app-border text-app-text',
            )}
          >
            {midi === undefined ? (
              <span className="text-app-text-muted" aria-hidden="true">
                &middot;
              </span>
            ) : (
              <>
                <span className="rmm-display text-base" dir="ltr">
                  {playedName(midi, expected)}
                </span>
                {mark === 'right' ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3" aria-hidden="true" />
                )}
                <span className="sr-only">
                  {mark === 'right'
                    ? t('slot-right', {
                        defaultValue: 'right',
                      })
                    : t('slot-wrong', {
                        defaultValue: 'wrong',
                      })}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PlayScaleLesson({
  lessonId,
  paused = false,
  sound,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
  /** How the learner's own notes are voiced: the lesson's sampled instrument (the synth when absent). */
  sound?: PlayOptions;
}) {
  const { t, i18n } = useTranslation('music-scales');
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  // Read once: the scales are dealt for the instrument the lesson opened with. A singer has no
  // instrument lesson on their path; one who opens this by a link plays it on the keys.
  const [instrument] = useState<ScaleInstrument>(() =>
    useLearnStore.getState().profile?.instrument === 'guitar' ? 'guitar' : 'piano',
  );
  const guitar = instrument === 'guitar';
  const [questions] = useState(() => playScaleQuestions(lessonId, instrument));
  const session = useQuestionSession<ScaleQuestion, ScaleAnswer>({
    machine: () => createPlayScaleMachine(questions),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: '.rmm-keys__bed button:not([tabindex="-1"]), .rmm-fret__cell[tabindex="0"], [data-focus-first]',
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const index = inSession ? lesson.index : -1;
  const asking = lesson.kind === 'asking';
  const phases = useInputPhases();
  useNoteSound(!paused, sound);
  useLessonInputStart();

  // The notes played so far, for the scale being asked. A ref holds them as well as state so two
  // notes in one tick (a MIDI burst) see each other; both are tied to the question's index, so a
  // new scale starts empty with no reset to run.
  const playedRef = useRef<Played>({
    index: -1,
    midis: [],
  });
  const [played, setPlayed] = useState<Played>({
    index: -1,
    midis: [],
  });
  const midis = played.index === index ? played.midis : [];
  const question = session.card;

  const feed = (midi: number) => {
    if (paused || !asking || !question) return;
    const have = playedRef.current.index === index ? playedRef.current.midis : [];
    if (have.length >= SCALE_NOTE_COUNT) return;
    const next = {
      index,
      midis: [...have, midi],
    };
    playedRef.current = next;
    setPlayed(next);
    if (next.midis.length === SCALE_NOTE_COUNT)
      answer({
        midis: next.midis,
      });
  };
  useNoteEvents((e) => {
    if (e.type === 'on') feed(e.midi);
  });

  const title = sessionTitle(
    session,
    inSession
      ? t('scale-count', {
          n: lesson.index + 1,
          total,
          defaultValue: 'Scale {{n}} of {{total}}',
        })
      : '',
    t('lesson-complete', {
      defaultValue: 'Lesson complete',
    }),
    t('lesson-not-saved', {
      defaultValue: 'Not saved yet',
    }),
  );
  const name = question ? scaleName(t, question) : '';
  const run = question ? scaleRun(question.tonic, question.kind) : [];
  const fingers = question && !guitar ? fingering(question) : null;

  let line: string;
  let lineKey: string;
  if (lesson.kind === 'asking') {
    lineKey = `hint-${midis.length === 0 ? 0 : 1}`;
    line = guitar
      ? t('scale-hint-guitar', {
          defaultValue: 'Play the dots in order from the lowest. Any octave will do.',
        })
      : fingers
        ? t('scale-hint-fingering', {
            fingers: fingers.join(' '),
            defaultValue: 'Play it one note at a time, going up. Right hand fingers: {{fingers}}.',
          })
        : t('scale-hint', {
            defaultValue: 'Play it one note at a time, going up.',
          });
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    line = lesson.right
      ? t('scale-right', {
          defaultValue: 'Every note in order.',
        })
      : t('scale-not-quite', {
          notes: noteList(i18n.language, run.map(noteGlyphs)),
          defaultValue: 'Not quite: the notes are {{notes}}.',
        });
  } else {
    lineKey = 'score';
    line = t('scale-score', {
      correct: lesson.correct,
      total,
      count: Number(total),
      defaultValue_one: 'You played {{correct}} of {{total}} scale.',
      defaultValue: 'You played {{correct}} of {{total}} scales.',
    });
  }

  // What the live region says: the scale when it is new, each note as it is played, the result.
  const last = midis[midis.length - 1];
  const lastMark = question && last !== undefined ? gradeScale(question, midis)[midis.length - 1] : undefined;
  let said: ReactNode = '';
  if (lesson.kind === 'asking') {
    if (midis.length > 0 && last !== undefined) {
      const spelled = playedName(last, run[midis.length - 1]);
      said =
        lastMark === 'right'
          ? t('note-said-right', {
              note: spelled,
              defaultValue: '{{note}}, right',
            })
          : t('note-said-wrong', {
              note: spelled,
              defaultValue: '{{note}}, wrong',
            });
    } else if (session.announce) {
      said = `${title}. ${name}.`;
    }
  } else if (lesson.kind === 'feedback') {
    said = (
      <SaidParts
        parts={[
          lesson.right
            ? t('scale-right-sr', {
                name,
                defaultValue: '{{name}}: every note in order.',
              })
            : t('scale-wrong-sr', {
                name,
                defaultValue: '{{name}}: not every note was right.',
              }),
          line,
        ]}
      />
    );
  } else {
    said = line;
  }

  let answers: ReactNode;
  if (!inSession) {
    const stars = lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
    answers = (
      <LessonResult
        kind={lesson.kind}
        stars={stars}
        returnTo={`/rmhmusic/lesson/${lessonId}`}
        onRetry={session.retry}
        className="flex-1"
      />
    );
  } else if (guitar) {
    answers = (
      <div ref={answerGroup} className="h-full">
        <FretboardView
          asking={asking}
          onAnswer={(p) => feed(fretMidi(p.string, p.fret))}
          right={question ? guitarPosition(question) : undefined}
          voice={sound}
        />
      </div>
    );
  } else if (input === 'mic' || input === 'midi') {
    answers = (
      <div ref={answerGroup} className="h-full">
        <div
          tabIndex={-1}
          data-focus-first=""
          role="group"
          aria-label={t('scale-region', {
            defaultValue: 'Where you play',
          })}
          className="h-full"
        >
          <DeviceRegion input={input} on={phases[input] === 'active'} />
        </div>
      </div>
    );
  } else if (
    input === 'keys' &&
    // The computer keys span C4 to C5 only: any scale that climbs higher is played on the on-screen keys.
    (!question || scaleMidis(question.kind, question.start).every(inKeysRange))
  ) {
    answers = (
      <div ref={answerGroup} className="h-full">
        <div
          tabIndex={-1}
          data-focus-first=""
          role="group"
          aria-label={t('scale-region', {
            defaultValue: 'Where you play',
          })}
          className="rmm-sheet flex h-full items-center justify-center p-4 text-center"
        >
          <p className="text-sm leading-6 text-app-text-muted">
            {t('scale-keys-region', {
              defaultValue: 'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
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
        question={
          <div className="space-y-1">
            <ScaleNameBox
              name={inSession ? name : ''}
              octave={
                inSession
                  ? t('scale-octave', {
                      defaultValue: 'one octave up',
                    })
                  : ''
              }
            />
            {question && inSession ? <ScaleSlots question={question} midis={midis} /> : <div className="min-h-14" />}
          </div>
        }
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

/** The scale to play, written large: one box of a fixed height (the placeholder's too). */
export function ScaleNameBox({
  name,
  octave,
  skeleton = false,
}: {
  name?: string;
  octave?: string;
  skeleton?: boolean;
}) {
  return (
    <div className="flex h-24 flex-col items-center justify-center">
      {skeleton ? (
        <div className="app-skeleton h-10 w-48 max-w-full" aria-hidden="true" />
      ) : (
        <>
          <p className="rmm-display text-[2.5rem] leading-[3rem] text-app-text">{name}</p>
          <p className="text-sm leading-5 text-app-text-muted">{octave}</p>
        </>
      )}
    </div>
  );
}
