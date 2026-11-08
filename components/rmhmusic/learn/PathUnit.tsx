'use client';

/**
 * PathUnit — one unit of the learning path, as a notebook page: the unit's title written above a
 * five-line staff, then its lessons as the page's ruled lines, each marked with a notehead. A
 * lesson's state is always written out ("Not started", "2 stars", "Coming soon") in a pencilled
 * tag, never shown by the notehead or colour alone.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lesson, Unit } from '@/lib/rmhmusic/learn/content/path';
import type { LessonProgressRow } from '@/lib/rmhmusic/learn/store';
import { PRIMARY_BUTTON } from './buttons';
import { Notehead, type NoteheadKind } from './Notehead';

interface PathUnitProps {
  unit: Unit;
  progress: ReadonlyMap<string, LessonProgressRow>;
  onOpenLesson?: (lessonId: string) => void;
  /**
   * Loading placeholder: the same page and rows with their content hidden (`invisible` keeps its
   * size) and one skeleton block laid over each row, so the placeholder is exactly as tall as the
   * loaded unit and cannot drift from it.
   */
  placeholder?: boolean;
}

function marker(lesson: Lesson, row: LessonProgressRow | undefined): NoteheadKind {
  if (!lesson.available) return 'dashed';
  return row && row.stars > 0 ? 'filled' : 'open';
}

function LessonState({ lesson, row }: { lesson: Lesson; row: LessonProgressRow | undefined }) {
  const { t } = useTranslation('c-rmhmusic');
  if (!lesson.available) {
    return <>{t('lesson-coming-soon', { defaultValue: 'Coming soon' })}</>;
  }
  if (row && row.stars > 0) {
    // Stars are noteheads: one filled head per star earned, then the count in words.
    return (
      <>
        <span className="flex items-center gap-0.5 text-(--app-accent)">
          {Array.from({ length: row.stars }, (_, i) => (
            <Notehead key={i} kind="filled" className="h-2.5 w-3" />
          ))}
        </span>
        {t('lesson-stars', {
          count: row.stars,
          defaultValue_one: '{{count}} star',
          defaultValue: '{{count}} stars',
        })}
      </>
    );
  }
  return row
    ? t('lesson-started', { defaultValue: 'Started' })
    : t('lesson-not-started', { defaultValue: 'Not started' });
}

export function PathUnit({ unit, progress, onOpenLesson, placeholder = false }: PathUnitProps) {
  const { t } = useTranslation('c-rmhmusic');
  const headingId = useId();
  const hidden = placeholder ? ' invisible' : '';

  return (
    <section
      aria-labelledby={placeholder ? undefined : headingId}
      aria-hidden={placeholder || undefined}
      className="rmm-sheet"
    >
      <div className="rmm-sheet__head">
        {/* Unit and lesson titles are English catalogue strings for now; they are localised in a later phase. */}
        <h2
          id={headingId}
          className={`rmm-display text-xl font-semibold text-(--app-text)${hidden}`}
        >
          {unit.title}
        </h2>
      </div>
      <ul className="rmm-ruled">
        {unit.lessons.map((lesson) => {
          const row = progress.get(lesson.id);
          return (
            <li
              key={lesson.id}
              className={`relative flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4${hidden}`}
            >
              {placeholder && (
                <span className="app-skeleton visible absolute inset-x-4 inset-y-3" />
              )}
              <div className="flex min-w-0 flex-1 gap-3">
                <Notehead
                  kind={marker(lesson, row)}
                  className={`mt-1.5 ${lesson.available ? 'text-(--app-accent)' : 'text-(--app-text-dim)'}`}
                />
                <div className="min-w-0">
                  <p className="font-medium text-(--app-text)">{lesson.title}</p>
                  <p className="text-sm text-(--app-text-muted)">{lesson.summary}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 ps-7 sm:justify-end sm:ps-0">
                <span className="rmm-tag">
                  <LessonState lesson={lesson} row={row} />
                </span>
                {lesson.available && (
                  <button
                    type="button"
                    onClick={() => onOpenLesson?.(lesson.id)}
                    aria-label={t('lesson-start-named', {
                      title: lesson.title,
                      defaultValue: 'Start {{title}}',
                    })}
                    className={`${PRIMARY_BUTTON} min-w-20`}
                  >
                    {t('lesson-start', { defaultValue: 'Start' })}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
