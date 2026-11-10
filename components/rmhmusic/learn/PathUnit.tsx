/**
 * PathUnit — one unit of the learning path, as a section of a sheet of manuscript paper: the
 * unit's title written above a five-line staff (closed by a double bar line), then its lessons
 * on the page's ruled lines, each marked with a notehead — filled once a star is earned, open
 * while it is there to play, dashed while it is not ready yet.
 *
 * No tags. Stars are filled noteheads written after the lesson's title, and the state in words
 * ("Not started", "2 stars", "Coming soon") is in the row for screen readers only; the notehead
 * and the Start button carry it for the eye. A lesson that is not ready yet is a quieter line
 * with no button.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lesson, Unit } from '@/lib/rmhmusic/learn/content/path';
import type { LessonProgressRow } from '@/lib/rmhmusic/learn/store';
import { PRIMARY_BUTTON } from './buttons';
import { Notehead, type NoteheadKind } from './Notehead';

/** A lesson earns at most three stars; their slots are reserved so a new star moves nothing. */
const MAX_STARS = 3;

interface PathUnitProps {
  unit: Unit;
  progress: ReadonlyMap<string, LessonProgressRow>;
  onOpenLesson?: (lessonId: string) => void;
  /**
   * Loading placeholder: the same section and rows with their content hidden (`invisible` keeps
   * its size) and one skeleton block laid over each row, so the placeholder is exactly as tall as
   * the loaded unit and cannot drift from it.
   */
  placeholder?: boolean;
}

function marker(lesson: Lesson, row: LessonProgressRow | undefined): NoteheadKind {
  if (!lesson.available) return 'dashed';
  return row && row.stars > 0 ? 'filled' : 'open';
}

export function PathUnit({ unit, progress, onOpenLesson, placeholder = false }: PathUnitProps) {
  const { t } = useTranslation('c-rmhmusic');
  const headingId = useId();
  const hidden = placeholder ? ' invisible' : '';

  return (
    <section
      aria-labelledby={placeholder ? undefined : headingId}
      aria-hidden={placeholder || undefined}
      className="rmm-unit"
    >
      <div className="rmm-unit__head">
        {/* Unit and lesson titles are English catalogue strings for now; they are localised in a later phase.
            At every width the title box is two lines tall whatever it holds (72px at 36px leading,
            80px at 40px), the words sitting on the staff: a title that fits one line in Fell may
            need two in the fallback face, or the other way round, and the swap must not move the
            page. The placeholder renders this same box. */}
        <h2
          id={headingId}
          className={`rmm-display flex min-h-18 items-end text-[1.75rem] leading-9 text-app-text sm:min-h-20 sm:text-[2rem] sm:leading-10${hidden}`}
        >
          {unit.title}
        </h2>
        <div aria-hidden="true" className="rmm-unit__staff" />
      </div>
      <ul className="rmm-ruled">
        {unit.lessons.map((lesson) => {
          const row = progress.get(lesson.id);
          const stars = Math.min(row?.stars ?? 0, MAX_STARS);
          // The state in words, for screen readers (the eye reads the notehead and the button).
          const state = !lesson.available
            ? t('lesson-coming-soon', { defaultValue: 'Coming soon' })
            : stars > 0
              ? t('lesson-stars', {
                  count: stars,
                  defaultValue_one: '{{count}} star',
                  defaultValue: '{{count}} stars',
                })
              : row
                ? t('lesson-started', { defaultValue: 'Started' })
                : t('lesson-not-started', { defaultValue: 'Not started' });
          return (
            <li
              key={lesson.id}
              className={`relative flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-8${hidden}`}
            >
              {placeholder && (
                <span className="app-skeleton visible absolute inset-x-4 inset-y-3 sm:inset-x-8" />
              )}
              <Notehead
                kind={marker(lesson, row)}
                className={`self-start mt-1.5 ${lesson.available ? 'text-app-accent' : 'text-app-text-dim'}`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={
                    lesson.available
                      ? 'font-medium text-app-text'
                      : 'text-app-text-muted'
                  }
                >
                  {lesson.title}
                  {lesson.available && (
                    // Three slots, always: earned stars are filled noteheads, the rest keep their
                    // room empty, so the title wraps the same before and after a star is earned.
                    <span aria-hidden="true" className="ms-2 inline-flex gap-0.5 align-[-1px]">
                      {Array.from({ length: MAX_STARS }, (_, i) => (
                        <Notehead
                          key={i}
                          kind="filled"
                          className={`h-2.5 w-3 text-app-accent${i < stars ? '' : ' invisible'}`}
                        />
                      ))}
                    </span>
                  )}
                  <span className="sr-only">{`, ${state}`}</span>
                </p>
                <p
                  className={`text-sm ${lesson.available ? 'text-app-text-muted' : 'text-app-text-dim'}`}
                >
                  {lesson.summary}
                </p>
              </div>
              {lesson.available && (
                <button
                  type="button"
                  onClick={() => onOpenLesson?.(lesson.id)}
                  aria-label={t('lesson-start-named', {
                    title: lesson.title,
                    defaultValue: 'Start {{title}}',
                  })}
                  className={`${PRIMARY_BUTTON} min-w-20 shrink-0`}
                >
                  {t('lesson-start', { defaultValue: 'Start' })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
