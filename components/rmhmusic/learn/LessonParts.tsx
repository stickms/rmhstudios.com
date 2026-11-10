/**
 * The pieces every lesson's input region shares (FirstNoteLesson, FlashcardLesson): the result
 * blocks once a lesson ends — saved (stars as noteheads), failed (Retry) and signed out (a
 * sign-in link that comes back here) — and, for the microphone or MIDI, the input chooser or the
 * "listening" line. Each fills the region's fixed box (`h-full`), so swapping one for another
 * moves nothing.
 */

import { useLayoutEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON } from './buttons';
import { InputChooser } from './InputChooser';
import { Notehead } from './Notehead';

export type LessonResultKind = 'saving' | 'saved' | 'failed' | 'signed-out';

function BackToPath() {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <Link
      to="/rmhmusic"
      className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium text-app-accent"
    >
      {t('lesson-back-to-path', { defaultValue: 'Back to your lessons' })}
    </Link>
  );
}

/**
 * The end of a lesson. `stars` (0–3) are drawn as three noteheads, filled for each one earned;
 * the count is the image's accessible name. `null` draws none (Practice earns no stars).
 * `returnTo` is the page the sign-in link comes back to.
 */
export function LessonResult({
  kind,
  stars,
  returnTo,
  onRetry,
  className,
}: {
  kind: LessonResultKind;
  stars: number | null;
  returnTo: string;
  onRetry: () => void;
  className?: string;
}) {
  const { t } = useTranslation('c-rmhmusic');
  if (kind === 'saved' || kind === 'saving') {
    // Keyed apart from the failure block: React would otherwise reuse this block's nodes for it,
    // and the reused "Back to your lessons" link moving down would count as a layout shift.
    return (
      <div
        key="done"
        className={cn(
          'rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-2 overflow-y-auto p-4 text-center',
          className,
        )}
      >
        {stars !== null && (
          <p
            className="flex justify-center gap-1"
            aria-label={t('lesson-stars', {
              count: stars,
              defaultValue_one: '{{count}} star',
              defaultValue: '{{count}} stars',
            })}
            role="img"
          >
            {[0, 1, 2].map((i) => (
              <Notehead
                key={i}
                kind={i < stars ? 'filled' : 'open'}
                className="h-5 w-7 text-app-accent"
              />
            ))}
          </p>
        )}
        <p role="status" className="min-h-5 self-stretch text-sm text-app-text-dim">
          {kind === 'saving' ? t('lesson-saving', { defaultValue: 'Saving…' }) : null}
        </p>
        <BackToPath />
      </div>
    );
  }
  return (
    <div
      key="problem"
      role="alert"
      className={cn(
        'rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-4 text-center',
        className,
      )}
    >
      <p className="text-sm text-app-danger">
        {kind === 'signed-out'
          ? t('error-signed-out', {
              defaultValue: 'Your session ended. Sign in again to continue.',
            })
          : t('lesson-save-failed', {
              defaultValue: "Couldn't save your progress. Check your connection and try again.",
            })}
      </p>
      {kind === 'signed-out' ? (
        <Link to="/login" search={{ callbackURL: returnTo }} className={PRIMARY_BUTTON}>
          {t('sign-in', { defaultValue: 'Sign in' })}
        </Link>
      ) : (
        <button type="button" onClick={onRetry} className={PRIMARY_BUTTON}>
          {t('retry', { defaultValue: 'Try again' })}
        </button>
      )}
      <BackToPath />
    </div>
  );
}

/**
 * The microphone or MIDI in a lesson: the input chooser while it is not running (taller than the
 * region, so it scrolls inside it rather than growing the page), else a line saying what is
 * being listened to.
 *
 * On a phone the learner's own input (the mic or MIDI row, whose "Use" iOS needs tapped) would
 * sit below that small box's fold, so the box is scrolled — itself only, never the page (no
 * scrollIntoView) — to show that row, before paint. The DOM order, and so the Tab order, stays.
 */
export function DeviceRegion({ input, on }: { input: 'mic' | 'midi'; on: boolean }) {
  const { t } = useTranslation('c-rmhmusic');
  const chooserBox = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const box = chooserBox.current;
    if (on || !box) return;
    const row = box.querySelector<HTMLElement>(`[data-input="${input}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const max = box.scrollHeight - box.clientHeight;
    box.scrollTop = Math.max(0, Math.min(max, top - 8));
  }, [on, input]);

  if (!on) {
    return (
      <section
        ref={chooserBox}
        className="rmm-sheet h-full overflow-y-auto overscroll-contain px-4 py-2"
      >
        <InputChooser />
      </section>
    );
  }
  return (
    <div className="rmm-sheet flex h-full items-center justify-center p-4 text-center">
      <p className="text-sm text-app-text-muted">
        {input === 'mic'
          ? t('first-note-listening-mic', { defaultValue: 'Listening to your microphone.' })
          : t('first-note-listening-midi', {
              defaultValue: 'Listening to your MIDI controller.',
            })}
      </p>
    </div>
  );
}
