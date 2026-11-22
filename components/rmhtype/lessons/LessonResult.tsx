/**
 * The result of a lesson run: speed, accuracy, stars and the keys missed most.
 *
 * Stars are worked out here for an instant answer and again on the server, which is
 * the one that is stored; the two use the same function. A save that failed says so
 * and offers a retry, because losing a first completion silently is worse than
 * asking.
 */
import { Link } from '@tanstack/react-router';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LESSONS, lessonById, starsFor, type Lesson, type RecordedRun } from '@/lib/rmhtype/lessons';
import type { TypingRunResult } from '@/lib/rmhtype/typing-run';
import { LessonStars } from '@/components/rmhtype/lessons/LessonStars';
import { useLessonLabels } from '@/components/rmhtype/lessons/lesson-labels';
import { useArrival } from '@/components/ui/arrive';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  /** `null` for the free practice drill, which has no stars. */
  lesson: Lesson | null;
  result: TypingRunResult;
  save: SaveState;
  saved: Pick<RecordedRun, 'nextLessonId'> | null;
  onRetry: () => void;
  onRetrySave: () => void;
}

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-app-sm px-4 py-2 text-sm font-semibold transition-colors pointer-coarse:min-h-11';
const PRIMARY = `${BUTTON} bg-app-accent text-app-accent-fg hover:bg-app-accent-hover`;
const SECONDARY = `${BUTTON} border border-app-border text-app-text hover:bg-app-surface-hover`;

export function LessonResult({ lesson, result, save, saved, onRetry, onRetrySave }: Props) {
  const { t } = useTranslation('rmhtype-lessons');
  const labels = useLessonLabels();
  const arrival = useArrival(true);
  const stars = lesson ? starsFor(result.wpm, result.accuracy, lesson) : 0;
  // The recommended lesson once the server has answered; the one after this until then.
  const nextId = stars >= 1 ? (saved?.nextLessonId ?? (lesson ? LESSONS[lesson.n]?.id : undefined)) : undefined;
  const next = nextId ? lessonById(nextId) : undefined;

  return (
    <section aria-labelledby="lesson-result-title" className={arrival}>
      <h2 id="lesson-result-title" className="text-2xl font-semibold">
        {lesson
          ? stars > 0
            ? t('result-title-done', {
                defaultValue: 'Lesson complete',
              })
            : t('result-title-again', {
                defaultValue: 'Not quite yet',
              })
          : t('result-title-practice', {
              defaultValue: 'Practice complete',
            })}
      </h2>

      {lesson ? (
        <div className="mt-3 flex items-center gap-3">
          <LessonStars stars={stars} className="[&_svg]:size-7" />
          <p className="text-sm text-app-text-muted">
            {stars === 3
              ? t('result-stars-all', {
                  defaultValue: 'Every target met.',
                })
              : stars > 0
                ? t('result-stars-some', {
                    defaultValue: 'Beat the next speed target for another star.',
                  })
                : t('result-stars-none', {
                    accuracy: lesson.targets.accuracy,
                    defaultValue: 'Stars need {{accuracy}}% accuracy and the first speed target.',
                  })}
          </p>
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-3 border-y border-app-border text-center">
        <div className="py-4">
          <dd className="font-mono text-3xl font-semibold text-app-accent">{Math.round(result.wpm)}</dd>
          <dt className="text-xs text-app-text-muted">
            {t('stat-wpm', {
              defaultValue: 'WPM',
            })}
          </dt>
        </div>
        <div className="border-x border-app-border py-4">
          <dd className="font-mono text-3xl font-semibold text-app-accent">{Math.round(result.accuracy)}%</dd>
          <dt className="text-xs text-app-text-muted">
            {t('stat-accuracy', {
              defaultValue: 'Accuracy',
            })}
          </dt>
        </div>
        <div className="py-4">
          <dd className="font-mono text-3xl font-semibold">{(result.elapsedMs / 1000).toFixed(1)}s</dd>
          <dt className="text-xs text-app-text-muted">
            {t('stat-time', {
              defaultValue: 'Time',
            })}
          </dt>
        </div>
      </dl>

      {lesson ? (
        <p className="mt-3 text-xs text-app-text-muted">
          {t('result-targets', {
            accuracy: lesson.targets.accuracy,
            one: lesson.targets.wpm[0],
            two: lesson.targets.wpm[1],
            three: lesson.targets.wpm[2],
            defaultValue:
              'Targets: {{accuracy}}% accuracy, and {{one}}, {{two}} or {{three}} WPM for one, two or three stars.',
          })}
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="text-sm font-semibold">
          {t('missed-title', {
            defaultValue: 'Keys you missed most',
          })}
        </h3>
        {result.missed.length === 0 ? (
          <p className="mt-1 text-sm text-app-text-muted">
            {t('missed-none', {
              defaultValue: 'No misses. Clean run.',
            })}
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {result.missed.map((miss) => (
              <li key={miss.key} className="rounded-app-sm border border-app-border px-2 py-1 text-sm">
                <kbd className="font-mono">
                  {miss.key === ' '
                    ? t('key-space', {
                        defaultValue: 'space',
                      })
                    : miss.key}
                </kbd>
                <span className="ml-2 text-app-text-muted">
                  {t('missed-count', {
                    errors: miss.errors,
                    defaultValue: '{{errors}} missed',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lesson ? (
        <p role="status" className="mt-4 text-sm text-app-text-muted">
          {save === 'saving'
            ? t('save-saving', {
                defaultValue: 'Saving your progress...',
              })
            : null}
          {save === 'saved'
            ? t('save-saved', {
                defaultValue: 'Progress saved.',
              })
            : null}
          {save === 'error' ? (
            <>
              <span className="text-app-danger">
                {t('save-error', {
                  defaultValue: 'Your progress was not saved.',
                })}
              </span>{' '}
              <button type="button" onClick={onRetrySave} className="underline hover:text-app-text">
                {t('save-retry', {
                  defaultValue: 'Try saving again',
                })}
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {next ? (
          <Link
            to="/rmhtype/lessons/$lessonId"
            params={{
              lessonId: next.id,
            }}
            className={PRIMARY}
          >
            {t('action-next', {
              defaultValue: 'Next lesson',
            })}
            <span className="sr-only">{labels.lessonTitle(next)}</span>
          </Link>
        ) : null}
        <button type="button" onClick={onRetry} className={next ? SECONDARY : PRIMARY}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {t('action-retry', {
            defaultValue: 'Try again',
          })}
        </button>
        <Link to="/rmhtype/lessons" className={SECONDARY}>
          {t('action-all-lessons', {
            defaultValue: 'All lessons',
          })}
        </Link>
      </div>
    </section>
  );
}
