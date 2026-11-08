'use client';

/**
 * PathUnit — one unit of the learning path: a titled panel of lesson rows.
 * A lesson's state is always written out ("Not started", "2 stars", "Coming
 * soon"), never colour alone.
 */

import { useId } from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Lesson, Unit } from '@/lib/rmhmusic/learn/content/path';
import type { LessonProgressRow } from '@/lib/rmhmusic/learn/store';

interface PathUnitProps {
  unit: Unit;
  progress: ReadonlyMap<string, LessonProgressRow>;
  onOpenLesson?: (lessonId: string) => void;
}

function LessonState({ lesson, row }: { lesson: Lesson; row: LessonProgressRow | undefined }) {
  const { t } = useTranslation('c-rmhmusic');
  if (!lesson.available) {
    return <>{t('lesson-coming-soon', { defaultValue: 'Coming soon' })}</>;
  }
  if (row && row.stars > 0) {
    return (
      <>
        <Star className="h-3.5 w-3.5 shrink-0 text-(--app-accent)" aria-hidden="true" />
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

export function PathUnit({ unit, progress, onOpenLesson }: PathUnitProps) {
  const { t } = useTranslation('c-rmhmusic');
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="app-glass rounded-(--app-radius)">
      {/* Unit and lesson titles are English catalogue strings for now; they are localised in a later phase. */}
      <h2 id={headingId} className="px-4 pt-4 pb-2 text-lg font-semibold text-(--app-text)">
        {unit.title}
      </h2>
      <ul className="divide-y divide-(--app-border)">
        {unit.lessons.map((lesson) => (
          <li
            key={lesson.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-(--app-text)">{lesson.title}</p>
              <p className="text-sm text-(--app-text-muted)">{lesson.summary}</p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="flex items-center gap-1 text-sm text-(--app-text-muted)">
                <LessonState lesson={lesson} row={progress.get(lesson.id)} />
              </span>
              {lesson.available && (
                <button
                  type="button"
                  onClick={() => onOpenLesson?.(lesson.id)}
                  aria-label={t('lesson-start-named', {
                    title: lesson.title,
                    defaultValue: 'Start {{title}}',
                  })}
                  className="min-h-11 min-w-20 rounded-(--app-radius-sm) bg-(--app-accent) px-5 text-sm font-semibold text-(--app-accent-fg) transition-colors hover:bg-(--app-accent-hover)"
                >
                  {t('lesson-start', { defaultValue: 'Start' })}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
