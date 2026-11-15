/**
 * The ear lessons' sound row: the one place in the listening box that says whether the question can
 * be heard. "Hear it again" when sound is ready; otherwise a plain sentence (sound asleep: tap to
 * turn it on; turning on; failed: tap to try again; loading: a sampled instrument's samples are on
 * the way; no Web Audio at all). Only the sentences that can be acted on are buttons: loading and
 * "can't play sound" are text.
 *
 * Kept apart from EarLesson so the row can be rendered and checked by itself (EarSoundRow.test.tsx).
 */
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { SoundRow } from '@/lib/rmhmusic/learn/audio/ear-playback';
import { cn } from '@/lib/utils';
import { TEXT_BUTTON } from './buttons';

type T =
  TFunction<'c-rmhmusic'>;

/** What the sound row says when it is not "Hear it again". */
export function soundProblem(
  t: T,
  sound: SoundRow,
): string {
  switch (
    sound
  ) {
    case 'asleep':
      return t(
        'ear-sound-asleep',
        {
          defaultValue:
            "Sound isn't playing. Tap to turn it on.",
        },
      );
    case 'waking':
      return t(
        'ear-sound-waking',
        {
          defaultValue:
            'Turning sound on…',
        },
      );
    case 'loading':
      return t(
        'ear-sound-loading',
        {
          defaultValue:
            'Loading sound…',
        },
      );
    case 'failed':
      return t(
        'ear-sound-failed',
        {
          defaultValue:
            "Sound still isn't playing. Tap to try again.",
        },
      );
    case 'none':
      return t(
        'ear-sound-none',
        {
          defaultValue:
            "This browser can't play sound.",
        },
      );
    default:
      return '';
  }
}

export function EarSoundRow({
  sound,
  inSession,
  onHear,
}: {
  sound: SoundRow;
  /** False once the session is over: the row keeps its box but shows nothing. */
  inSession: boolean;
  onHear: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const problem =
    soundProblem(
      t,
      sound,
    );
  if (
    sound ===
      'none' ||
    sound ===
      'loading'
  ) {
    return (
      <p
        className={cn(
          'px-2 text-sm leading-5 text-app-text-muted',
          !inSession &&
            'invisible',
        )}
      >
        {
          problem
        }
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={
        onHear
      }
      aria-busy={
        sound ===
          'waking' ||
        undefined
      }
      className={cn(
        TEXT_BUTTON,
        'w-full justify-center text-center leading-5',
        !inSession &&
          'invisible',
      )}
      inert={
        !inSession ||
        undefined
      }
    >
      {sound ===
      'ready'
        ? t(
            'ear-hear-again',
            {
              defaultValue:
                'Hear it again',
            },
          )
        : problem}
    </button>
  );
}
