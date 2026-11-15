/**
 * VoiceRangePicker — "Your voice": a singer's range (soprano, alto, tenor, baritone or bass) as a
 * radio group, the same pattern as the Sound dialog's rows (`radio-keys.ts`: one Tab stop on the
 * chosen row, the arrow keys move, Space or Enter picks; the chosen row carries a check). Each row
 * names the range and its compass in plain words ("A3 to D5"). Shown at the top of "Set up input"
 * for a voice learner; picking saves the range at once.
 */
import {
  useId,
  useRef,
} from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import {
  VOICE_RANGES,
  type VoiceRange,
} from '@/lib/rmhmusic/learn/schemas';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { VOICE_RANGE } from '@/lib/rmhmusic/learn/voice/range';
import { radioKey } from './radio-keys';

/** A range's name. Literal defaults, one call per id (the i18n default-drift gate reads them). */
export function voiceRangeName(
  t: TFunction,
  range: VoiceRange,
): string {
  switch (
    range
  ) {
    case 'soprano':
      return t(
        'voice-range-soprano',
        {
          defaultValue:
            'Soprano',
        },
      );
    case 'alto':
      return t(
        'voice-range-alto',
        {
          defaultValue:
            'Alto',
        },
      );
    case 'tenor':
      return t(
        'voice-range-tenor',
        {
          defaultValue:
            'Tenor',
        },
      );
    case 'bass':
      return t(
        'voice-range-bass',
        {
          defaultValue:
            'Baritone or bass',
        },
      );
  }
}

function rangeDetail(
  t: TFunction,
  range: VoiceRange,
): string {
  const r =
    VOICE_RANGE[
      range
    ];
  const span =
    {
      low: midiToName(
        r.low,
      ),
      high: midiToName(
        r.high,
      ),
    };
  switch (
    range
  ) {
    case 'tenor':
      return t(
        'voice-range-detail-tenor',
        {
          ...span,
          defaultValue:
            '{{low}} to {{high}}. Treble staff with a small 8: sung an octave lower.',
        },
      );
    case 'bass':
      return t(
        'voice-range-detail-bass',
        {
          ...span,
          defaultValue:
            '{{low}} to {{high}}. Bass staff.',
        },
      );
    default:
      return t(
        'voice-range-detail-treble',
        {
          ...span,
          defaultValue:
            '{{low}} to {{high}}. Treble staff.',
        },
      );
  }
}

export function VoiceRangePicker() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const stored =
    useLearnStore(
      (
        s,
      ) =>
        s
          .profile
          ?.voiceRange ??
        null,
    );
  const failed =
    useLearnStore(
      (
        s,
      ) =>
        s.saveFailed.includes(
          'voiceRange',
        ),
    );
  const rows =
    useRef<
      (HTMLButtonElement | null)[]
    >(
      [],
    );
  const headingId =
    useId();
  // Before a range is chosen no row is checked, and the first row takes the Tab stop.
  const tabStop =
    stored
      ? VOICE_RANGES.indexOf(
          stored,
        )
      : 0;
  const pick =
    (
      range: VoiceRange,
    ) =>
      void useLearnStore
        .getState()
        .setVoiceRange(
          range,
        );

  return (
    <div className="space-y-1">
      <p
        id={
          headingId
        }
        className="text-sm font-semibold text-app-text-muted"
      >
        {t(
          'voice-range-title',
          {
            defaultValue:
              'Your voice',
          },
        )}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={
          headingId
        }
        className="divide-y divide-app-border"
      >
        {VOICE_RANGES.map(
          (
            range,
            index,
          ) => {
            const chosen =
              range ===
              stored;
            return (
              <button
                key={
                  range
                }
                ref={(
                  el,
                ) => {
                  rows.current[
                    index
                  ] =
                    el;
                }}
                type="button"
                role="radio"
                aria-checked={
                  chosen
                }
                tabIndex={
                  index ===
                  tabStop
                    ? 0
                    : -1
                }
                data-voice-range={
                  range
                }
                onClick={() =>
                  pick(
                    range,
                  )
                }
                onKeyDown={(
                  e,
                ) => {
                  const action =
                    radioKey(
                      e.key,
                      index,
                      VOICE_RANGES.length,
                    );
                  if (
                    !action
                  )
                    return;
                  e.preventDefault();
                  if (
                    action.kind ===
                    'select'
                  )
                    pick(
                      range,
                    );
                  else
                    rows.current[
                      action
                        .index
                    ]?.focus();
                }}
                className="flex min-h-11 w-full items-start gap-3 rounded-app-sm py-2.5 text-start transition-colors hover:text-app-accent"
              >
                <span className="flex h-6 w-5 shrink-0 items-center justify-center">
                  {chosen && (
                    <Check
                      className="h-5 w-5 text-app-accent"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-app-text">
                    {voiceRangeName(
                      t,
                      range,
                    )}
                  </span>
                  <span className="block text-sm text-app-text-muted">
                    {rangeDetail(
                      t,
                      range,
                    )}
                  </span>
                </span>
              </button>
            );
          },
        )}
      </div>
      {failed && (
        <p
          role="alert"
          className="text-sm text-app-danger"
        >
          {t(
            'voice-range-save-failed',
            {
              defaultValue:
                "Couldn't save your voice. Pick it again.",
            },
          )}
        </p>
      )}
    </div>
  );
}
