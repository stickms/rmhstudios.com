/**
 * The note reader tab: play or sing a note and see it written. Every note-on from the learner's
 * input (the microphone, MIDI, the computer keys or the on-screen keys) is written on the low card
 * (`SprintSheet`, one note) where `readPlacement` puts it — piano: treble from middle C, bass
 * below; guitar: treble an octave up with the small 8 — with its name and octave, the cents for
 * the microphone, and the last few notes before it as plain text. A note the card cannot reach is
 * named and said to be too high or too low, never drawn in the wrong place.
 *
 * The sheet's lines and the input region keep their heights in every state, so a note never moves
 * the page. The polite status line names each new note once.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  Instrument,
  LearnInput,
} from '@/lib/rmhmusic/learn/schemas';
import type { InputSource } from '@/lib/rmhmusic/learn/input/events';
import {
  readName,
  readPlacement,
} from '@/lib/rmhmusic/learn/tuner/read';
import { SprintSheet } from '../StaffCard';
import { DeviceRegion } from '../LessonParts';
import { OnScreenKeyboard } from '../OnScreenKeyboard';
import {
  useInputPhases,
  useNoteEvents,
} from '../useLearnInput';

/** How many earlier notes the history line keeps. */
export const HISTORY = 5;

interface ReadNote {
  midi: number;
  /** The microphone's cents; absent for exact sources. */
  cents?: number;
  source: InputSource;
}

function centsLine(
  t: TFunction,
  cents: number,
): string {
  const n =
    Math.round(
      cents,
    );
  const signed =
    n >
    0
      ? `+${n}`
      : n <
          0
        ? `−${-n}`
        : '0';
  return t(
    'tuner-cents',
    {
      cents:
        signed,
      defaultValue:
        '{{cents}} cents',
    },
  );
}

export function ReadPanel({
  input,
  instrument,
  loading,
}: {
  input: LearnInput | null;
  instrument: Instrument;
  loading: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const phases =
    useInputPhases();
  const [
    notes,
    setNotes,
  ] =
    useState<
      readonly ReadNote[]
    >(
      [],
    );

  useNoteEvents(
    (
      e,
    ) => {
      if (
        e.type !==
        'on'
      )
        return;
      const note: ReadNote =
        {
          midi: e.midi,
          source:
            e.source,
        };
      if (
        e.source ===
          'mic' &&
        e.cents !==
          undefined &&
        Number.isFinite(
          e.cents,
        )
      )
        note.cents =
          e.cents;
      setNotes(
        (
          prev,
        ) =>
          [
            note,
            ...prev,
          ].slice(
            0,
            HISTORY +
              1,
          ),
      );
    },
  );

  const current =
    notes[0];
  const guitar =
    instrument ===
    'guitar';
  const placed =
    current
      ? readPlacement(
          current.midi,
          instrument,
        )
      : null;
  const onCard =
    placed !==
      null &&
    typeof placed !==
      'string'
      ? placed
      : null;
  const name =
    current
      ? readName(
          current.midi,
        )
      : '';
  const clef =
    onCard?.clef ??
    'treble';
  const staffName =
    clef ===
    'bass'
      ? t(
          'tuner-bass-staff',
          {
            defaultValue:
              'the bass staff',
          },
        )
      : t(
          'tuner-treble-staff',
          {
            defaultValue:
              'the treble staff',
          },
        );
  const label =
    current
      ? onCard
        ? t(
            'tuner-read-label',
            {
              name,
              staff:
                staffName,
              defaultValue:
                '{{name}} written on {{staff}}',
            },
          )
        : t(
            'tuner-read-off-label',
            {
              name,
              defaultValue:
                '{{name}}, off this staff',
            },
          )
      : t(
          'tuner-read-empty-label',
          {
            defaultValue:
              'An empty staff',
          },
        );

  let detail =
    '';
  if (
    placed ===
    'high'
  )
    detail =
      t(
        'tuner-read-high',
        {
          defaultValue:
            'Too high to write on this staff.',
        },
      );
  else if (
    placed ===
    'low'
  )
    detail =
      t(
        'tuner-read-low',
        {
          defaultValue:
            'Too low to write on this staff.',
        },
      );
  else if (
    current?.cents !==
    undefined
  )
    detail =
      centsLine(
        t,
        current.cents,
      );

  const earlier =
    notes
      .slice(
        1,
      )
      .map(
        (
          n,
        ) =>
          readName(
            n.midi,
          ),
      );
  const history =
    earlier.length
      ? t(
          'tuner-read-history',
          {
            notes:
              earlier.join(
                ', ',
              ),
            defaultValue:
              'Before: {{notes}}',
          },
        )
      : '';

  let region;
  if (
    loading ||
    input ===
      null
  ) {
    region =
      (
        <div
          aria-hidden="true"
          className="app-skeleton h-full w-full"
        />
      );
  } else if (
    input ===
      'mic' ||
    input ===
      'midi'
  ) {
    region =
      (
        <DeviceRegion
          input={
            input
          }
          on={
            phases[
              input
            ] ===
            'active'
          }
        />
      );
  } else if (
    input ===
    'keys'
  ) {
    region =
      (
        <div className="rmm-sheet flex h-full items-center justify-center p-4 text-center">
          <p className="text-sm leading-6 text-app-text-muted">
            {t(
              'flash-keys-region',
              {
                defaultValue:
                  'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
              },
            )}
          </p>
        </div>
      );
  } else {
    region =
      (
        <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />
      );
  }

  return (
    <div className="space-y-4">
      <section
        aria-label={t(
          'tuner-read-sheet',
          {
            defaultValue:
              'The note you played',
          },
        )}
        className="rmm-sheet space-y-1 p-5 text-center sm:p-6"
      >
        <p className="h-6 text-sm leading-6 text-app-text-muted">
          {current
            ? ''
            : t(
                'tuner-read-hint',
                {
                  defaultValue:
                    'Play or sing a note to see it written.',
                },
              )}
        </p>
        <SprintSheet
          clef={
            clef
          }
          notes={
            onCard
              ? [
                  onCard.note,
                ]
              : []
          }
          arrangement="chord"
          state="ask"
          label={
            label
          }
          range="low"
          octaveClef={
            guitar
          }
        />
        <p
          dir="ltr"
          className="rmm-display h-12 text-[2.5rem] leading-[3rem] text-app-text"
        >
          {
            name
          }
        </p>
        <p className="h-6 text-sm leading-6 text-app-text-muted tabular-nums">
          {
            detail
          }
        </p>
        <p className="h-6 truncate text-sm leading-6 text-app-text-muted">
          {
            history
          }
        </p>
        <p
          role="status"
          className="sr-only"
        >
          {
            name
          }
        </p>
      </section>
      <div className="rmm-input-region">
        {
          region
        }
      </div>
    </div>
  );
}
