/**
 * The course index: units and lessons with best stars and speed, the recommended
 * next lesson marked, and (once a unit is complete) a link to practice worst keys.
 *
 * Every lesson is a link: nothing is locked behind a speed target. The recommendation
 * is a label, in words, on the first lesson without a star.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { lessonProgressQuery } from '@/lib/rmhtype/rmhtype.queries';
import {
  UNITS,
  isUnitComplete,
  lessonById,
  recommendedNext,
  type LessonProgressRow,
} from '@/lib/rmhtype/lessons';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import { LessonStars } from '@/components/rmhtype/lessons/LessonStars';
import { useLessonLabels } from '@/components/rmhtype/lessons/lesson-labels';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';

export default function LessonsIndex() {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-lessons',
    );
  const labels =
    useLessonLabels();
  const progressQuery =
    useQuery(
      lessonProgressQuery(),
    );
  const rows: LessonProgressRow[] | null =
    progressQuery.data?.progress ??
    null;
  const failed =
    progressQuery.isError;
  const load =
    progressQuery.refetch;
  const arrival =
    useArrival(
      rows !==
        null,
    );

  const progress =
    useMemo(
      () =>
        new Map(
          (
            rows ??
            []
          ).map(
            (
              row,
            ) => [
              row.lessonId,
              row,
            ],
          ),
        ),
      [
        rows,
      ],
    );
  const recommended =
    rows
      ? recommendedNext(
          progress,
        )
      : null;
  const anyUnitComplete =
    UNITS.some(
      (
        unit,
      ) =>
        isUnitComplete(
          progress,
          unit,
        ),
    );

  return (
    <div className="app-page">
      <RmhTypeHeader
        backLabel="RMH Type"
        backHref="/rmhtype"
      />
      <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-8">
        <h1
          className="text-3xl font-semibold"
          style={{
            fontFamily:
              'var(--app-font-display)',
          }}
        >
          {t(
            'title',
            {
              defaultValue:
                'Touch-typing lessons',
            },
          )}
        </h1>
        <p className="mt-2 max-w-xl text-app-text-muted">
          {t(
            'intro',
            {
              defaultValue:
                'Learn to type without looking, one small group of keys at a time. Every lesson is open; the recommended one is the next you have not finished.',
            },
          )}
        </p>

        {failed ? (
          <div className="mt-8">
            <p className="text-app-danger">
              {t(
                'load-failed',
                {
                  defaultValue:
                    'Could not load your progress.',
                },
              )}
            </p>
            <button
              type="button"
              onClick={() =>
                void load()
              }
              className="mt-2 underline hover:text-app-text"
            >
              {t(
                'load-retry',
                {
                  defaultValue:
                    'Try again',
                },
              )}
            </button>
          </div>
        ) : rows ===
          null ? (
          <div
            className="mt-8 space-y-3"
            role="status"
            aria-label={t(
              'loading',
              {
                defaultValue:
                  'Loading lessons',
              },
            )}
          >
            {Array.from(
              {
                length: 6,
              },
              (
                _,
                i,
              ) => (
                <Skeleton
                  key={
                    i
                  }
                  className="h-10 w-full"
                />
              ),
            )}
          </div>
        ) : (
          <div
            className={
              arrival
            }
          >
            {anyUnitComplete ? (
              <p className="mt-6 text-sm">
                <Link
                  to="/rmhtype/lessons/$lessonId"
                  params={{
                    lessonId:
                      'practice',
                  }}
                  className="underline hover:text-app-accent"
                >
                  {t(
                    'practice-link',
                    {
                      defaultValue:
                        'Practice your worst keys',
                    },
                  )}
                </Link>
                <span className="text-app-text-muted">
                  {' '}
                  {t(
                    'practice-note',
                    {
                      defaultValue:
                        'A free drill built from the keys you miss most. It earns no stars.',
                    },
                  )}
                </span>
              </p>
            ) : null}

            {UNITS.map(
              (
                unit,
              ) => (
                <section
                  key={
                    unit.id
                  }
                  aria-labelledby={`unit-${unit.id}`}
                  className="mt-8"
                >
                  <h2
                    id={`unit-${unit.id}`}
                    className="text-lg font-semibold"
                  >
                    {t(
                      'unit-heading',
                      {
                        n: unit.id,
                        name: labels.unitTitle(
                          unit.id,
                        ),
                        defaultValue:
                          'Unit {{n}}: {{name}}',
                      },
                    )}
                  </h2>
                  <ul className="mt-2 border-t border-app-border">
                    {unit.lessonIds.map(
                      (
                        id,
                      ) => {
                        const lesson =
                          lessonById(
                            id,
                          );
                        if (
                          !lesson
                        )
                          return null;
                        const row =
                          progress.get(
                            id,
                          );
                        return (
                          <li
                            key={
                              id
                            }
                            className="border-b border-app-border"
                          >
                            <Link
                              to="/rmhtype/lessons/$lessonId"
                              params={{
                                lessonId:
                                  id,
                              }}
                              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 hover:bg-app-surface-hover sm:grid-cols-[1fr_auto_5rem]"
                            >
                              <span>
                                <span className="font-medium">
                                  {labels.lessonTitle(
                                    lesson,
                                  )}
                                </span>
                                {lesson.review ? null : (
                                  <kbd className="ml-3 font-mono text-sm text-app-text-muted">
                                    {lesson.newKeys.join(
                                      ' ',
                                    )}
                                  </kbd>
                                )}
                                {id ===
                                recommended ? (
                                  <span className="ml-3 rounded-app-sm border border-app-accent px-1.5 py-0.5 text-xs text-app-accent">
                                    {t(
                                      'recommended',
                                      {
                                        defaultValue:
                                          'Recommended',
                                      },
                                    )}
                                  </span>
                                ) : null}
                              </span>
                              <LessonStars
                                stars={
                                  row?.stars ??
                                  0
                                }
                              />
                              <span className="col-span-2 font-mono text-xs text-app-text-muted sm:col-span-1 sm:text-right">
                                {row
                                  ? t(
                                      'best-wpm',
                                      {
                                        wpm: Math.round(
                                          row.bestWpm,
                                        ),
                                        defaultValue:
                                          'Best {{wpm}} WPM',
                                      },
                                    )
                                  : t(
                                      'not-tried',
                                      {
                                        defaultValue:
                                          'Not tried',
                                      },
                                    )}
                              </span>
                            </Link>
                          </li>
                        );
                      },
                    )}
                  </ul>
                </section>
              ),
            )}
            <p className="mt-8 text-xs text-app-text-dim">
              {t(
                'footnote',
                {
                  defaultValue:
                    'Lesson runs never count toward a leaderboard. Your key timings feed your typing statistics.',
                },
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
