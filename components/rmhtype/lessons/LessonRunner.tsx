/**
 * One lesson run: the text, the next key and its finger, live accuracy, then the result.
 *
 * Input is the physical keyboard only, read from `keydown` on a visually hidden field
 * that keeps focus. There is no timer and no frame loop: each key carries a
 * `performance.now()` timestamp into the run (`lib/rmhtype/typing-run.ts`) and the
 * view re-renders on input and at no other time. Escape leaves without saving.
 *
 * `lessonId === 'practice'` is the free drill on the member's worst keys: no stars, no
 * progress row, but its key timings are recorded like any other run.
 *
 * The drill is chosen in an effect, not during render, so the server and the first
 * client render agree (a random seed in render would not).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  RMHTYPE_LESSONS_KEY,
  buildPracticeDrill,
  recordKeyStats,
  recordLessonRun,
} from '@/lib/rmhtype/rmhtype.queries';
import { DEFAULT_LAYOUT } from '@/lib/rmhtype/keystats';
import { PRACTICE_ID, drillFor, fingerFor, lessonById, shiftFingerFor, type RecordedRun } from '@/lib/rmhtype/lessons';
import { createTypingRun, type TypingRun, type TypingRunResult } from '@/lib/rmhtype/typing-run';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import { LessonKeyboard } from '@/components/rmhtype/lessons/LessonKeyboard';
import { LessonResult, type SaveState } from '@/components/rmhtype/lessons/LessonResult';
import { useLessonLabels } from '@/components/rmhtype/lessons/lesson-labels';
import { useArrival } from '@/components/ui/arrive';

const PRACTICE_WORDS = 20;

export default function LessonRunner({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation('rmhtype-lessons');
  const labels = useLessonLabels();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lesson = lessonById(lessonId) ?? null;
  const isPractice = lessonId === PRACTICE_ID;

  const [text, setText] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<TypingRunResult | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [saved, setSaved] = useState<RecordedRun | null>(null);
  const [focused, setFocused] = useState(true);
  const run = useRef<TypingRun | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const textArrival = useArrival(text !== null);

  // A fresh drill for every attempt: a lesson drill from a random seed, or the practice test.
  useEffect(() => {
    let cancelled = false;
    run.current = null;
    setText(null);
    setLoadFailed(false);
    setTyped('');
    setResult(null);
    setSave('idle');
    setSaved(null);

    async function load() {
      let drill: string | null = null;
      if (lesson) {
        drill = drillFor(lesson, Math.floor(Math.random() * 0x100000000));
      } else if (isPractice) {
        try {
          const data = await buildPracticeDrill(PRACTICE_WORDS);
          drill = data.test.text || null;
        } catch {
          drill = null;
        }
      }
      if (cancelled) return;
      if (!drill) {
        setLoadFailed(true);
        return;
      }
      run.current = createTypingRun(drill);
      setText(drill);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [lesson, isPractice, attempt]);

  useEffect(() => {
    if (text !== null && !result) input.current?.focus();
  }, [text, result]);

  const submitProgress = useCallback(
    async (finished: TypingRunResult) => {
      if (!lesson) return;
      setSave('saving');
      try {
        const data = await recordLessonRun({
          lessonId: lesson.id,
          wpm: finished.wpm,
          accuracy: finished.accuracy,
        });
        setSaved(data);
        setSave('saved');
        // The index shows best stars; it reads the new ones on its next visit.
        void queryClient.invalidateQueries({
          queryKey: RMHTYPE_LESSONS_KEY,
        });
      } catch {
        setSave('error');
      }
    },
    [lesson, queryClient],
  );

  const finish = useCallback(
    (finished: TypingRunResult) => {
      setResult(finished);
      // Key timings are a side channel for the heatmap: a failure to record them must
      // not hold up the result, and is not retried (a retry could count a run twice).
      if (finished.keyStats.length > 0) {
        recordKeyStats({
          layout: DEFAULT_LAYOUT,
          keys: finished.keyStats,
        }).catch(() => undefined);
      }
      void submitProgress(finished);
    },
    [submitProgress],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const current = run.current;
      if (!current || current.done()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        void router.navigate({
          to: '/rmhtype/lessons',
        });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const at = performance.now();
      if (e.key === 'Backspace') {
        e.preventDefault();
        current.backspace(at);
        setTyped(current.typed());
        return;
      }
      if ([...e.key].length !== 1) return;
      e.preventDefault();
      // A held key is not typing: it would run up errors the learner never chose.
      if (e.repeat) return;
      current.type(e.key, at);
      setTyped(current.typed());
      if (current.done()) finish(current.result());
    },
    [finish, router],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const title = lesson
    ? labels.lessonTitle(lesson)
    : t('practice-title', {
        defaultValue: 'Practice your worst keys',
      });

  if (!lesson && !isPractice) return null;

  const header = (
    <RmhTypeHeader
      backLabel={t('back-to-lessons', {
        defaultValue: 'Lessons',
      })}
      backHref="/rmhtype/lessons"
    />
  );

  if (loadFailed) {
    return (
      <div className="app-page">
        {header}
        <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-8">
          <p className="text-app-danger">
            {t('drill-failed', {
              defaultValue: 'Could not build a drill.',
            })}
          </p>
          <button type="button" onClick={retry} className="mt-3 underline hover:text-app-text">
            {t('drill-retry', {
              defaultValue: 'Try again',
            })}
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="app-page">
        {header}
        <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-8">
          <LessonResult
            lesson={lesson}
            result={result}
            save={save}
            saved={saved}
            onRetry={retry}
            onRetrySave={() => void submitProgress(result)}
          />
        </div>
      </div>
    );
  }

  if (text === null) {
    return (
      <div className="app-page">
        {header}
        <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p role="status" className="mt-4 text-app-text-muted">
            {t('loading-drill', {
              defaultValue: 'Preparing your drill...',
            })}
          </p>
        </div>
      </div>
    );
  }

  const nextChar = typed.length < text.length ? text.charAt(typed.length) : null;
  const hasMistake = [...typed].some((char, i) => char !== text.charAt(i));
  const words = text.split(' ');
  const wordIndex = text.slice(0, typed.length).split(' ').length - 1;
  const liveAccuracy = run.current?.liveAccuracy() ?? 100;
  const finger = nextChar && !hasMistake ? fingerFor(nextChar) : null;
  const shiftFinger = nextChar && !hasMistake ? shiftFingerFor(nextChar) : null;

  return (
    <div className="app-page">
      {header}
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 p-4 md:p-8">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {lesson && !lesson.review ? (
            <p className="mt-1 text-sm text-app-text-muted">
              {t('new-keys', {
                defaultValue: 'New keys',
              })}{' '}
              <kbd className="font-mono text-app-text">{lesson.newKeys.join(' ')}</kbd>
            </p>
          ) : null}
        </div>

        {/* The one live region: the word you are on, announced as it changes, not each letter. */}
        <p className="sr-only" aria-live="polite">
          {words[wordIndex] ?? ''}
        </p>
        <input
          ref={input}
          value=""
          readOnly
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={t('input-label', {
            defaultValue: 'Type the text shown above',
          })}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="sr-only"
        />

        <div
          lang="en"
          dir="ltr"
          className={`rmhtype-passage select-none rounded-app border border-app-border p-5 text-2xl leading-relaxed ${textArrival ?? ''}`}
        >
          <div aria-hidden="true">
            {[...text].map((char, i) => {
              let className = 'rmhtype-char-untyped';
              if (i < typed.length) className = typed[i] === char ? 'rmhtype-char-correct' : 'rmhtype-char-incorrect';
              if (i === typed.length) className += ' rmhtype-cursor';
              return (
                <span key={i} className={className}>
                  {char}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
          <p className="text-app-text-muted" data-testid="lesson-guidance">
            {hasMistake
              ? t('guide-fix', {
                  defaultValue: 'Press Backspace to fix the mistake.',
                })
              : nextChar === ' '
                ? t('guide-space', {
                    defaultValue: 'Press the space bar with either thumb.',
                  })
                : finger
                  ? t('guide-finger', {
                      finger: labels.fingerName(finger),
                      defaultValue: 'Next key: use your {{finger}}.',
                    })
                  : null}{' '}
            {shiftFinger
              ? t('guide-shift', {
                  finger: labels.fingerName(shiftFinger),
                  defaultValue: 'Hold Shift with your {{finger}}.',
                })
              : null}
          </p>
          <p className="font-mono text-app-text-muted">
            {t('live-accuracy', {
              accuracy: Math.round(liveAccuracy),
              defaultValue: 'Accuracy {{accuracy}}%',
            })}
            {' · '}
            {typed.length}/{text.length}
          </p>
        </div>

        <LessonKeyboard nextChar={hasMistake ? null : nextChar} />

        <p className="text-xs text-app-text-dim">
          {t('hint-escape', {
            defaultValue: 'Escape leaves the lesson without saving.',
          })}
        </p>
        {focused ? null : (
          <button type="button" onClick={() => input.current?.focus()} className="underline hover:text-app-text">
            {t('hint-refocus', {
              defaultValue: 'Keep typing',
            })}
          </button>
        )}
      </div>
    </div>
  );
}
